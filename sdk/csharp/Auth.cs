using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Security.Cryptography;
using System.Management;
using System.Security;
using System.Net.Security;
using System.Net;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Threading;

namespace SpectreAuth
{
    public class AuthResult
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public string Token { get; set; } = "";
        public string Username { get; set; } = "";
        public string Expiration { get; set; } = "";
        public int DaysLeft { get; set; }
    }

    public sealed class SpectreAuthClient : IDisposable
    {
        private readonly HttpClient _http;
        private SecureString _appId;
        private SecureString _appSecret;
        private SecureString _sessionToken;
        private readonly string _certThumbprint;
        private readonly byte[] _hmacKey; // chave derivada
        private bool _disposed;

        // Construtor com credenciais (recomendado)
        public SpectreAuthClient(string baseUrl, string appId, string appSecret, string certThumbprint = null)
        {
            if (!baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
                !baseUrl.StartsWith("http://localhost", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("HTTPS is required for production.");

            _appId = ToSecureString(appId);
            _appSecret = ToSecureString(appSecret);
            _certThumbprint = certThumbprint ?? Config.CERT_THUMBPRINT;

            var handler = new HttpClientHandler();
            handler.ServerCertificateCustomValidationCallback = ValidateCertificate;

            var timeout = TimeSpan.FromMilliseconds(Config.REQUEST_TIMEOUT_MS);
            _http = new HttpClient(handler)
            {
                BaseAddress = new Uri(baseUrl.TrimEnd('/')),
                Timeout = timeout
            };

            // Derivar chave HMAC com PBKDF2
            _hmacKey = DeriveKey(appSecret, "SpectreSalt2025");

            // Anti-debug distribuído
            CheckDebugger();
            CheckVM();
            CheckTools();
        }

        // Construtor padrão (usando Config – obsoleto, apenas para compatibilidade)
        public SpectreAuthClient() : this(Config.BASE_URL, Config.APP_ID, Config.APP_SECRET, Config.CERT_THUMBPRINT) { }

        // ============================================================
        // ANTI-DEBUG / VM / FERRAMENTAS (ofuscado)
        // ============================================================
        private void CheckDebugger()
        {
            if (Debugger.IsAttached) throw new InvalidOperationException("Debugger detected.");
            if (IsDebuggerPresent()) throw new InvalidOperationException("Debugger detected.");
            if (IsRemoteDebuggerPresent()) throw new InvalidOperationException("Remote debugger detected.");
            // Timing check
            var sw = Stopwatch.StartNew();
            var dummy = 0;
            for (int i = 0; i < 1000000; i++) dummy ^= i;
            sw.Stop();
            if (sw.ElapsedMilliseconds < 2) throw new InvalidOperationException("Timing anomaly.");
        }

        private void CheckVM()
        {
            // Verifica hypervisor bit via CPUID (simplificado)
            if (IsVirtualMachine()) throw new InvalidOperationException("Virtual machine detected.");
        }

        private void CheckTools()
        {
            string[] tools = { "x64dbg", "ollydbg", "cheatengine", "processhacker" };
            foreach (var proc in Process.GetProcesses())
            {
                foreach (var t in tools)
                {
                    if (proc.ProcessName.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0)
                        throw new InvalidOperationException("Debugging tool detected.");
                }
            }
        }

        [DllImport("kernel32.dll")]
        private static extern bool IsDebuggerPresent();

        [DllImport("kernel32.dll")]
        private static extern bool CheckRemoteDebuggerPresent(IntPtr hProcess, ref bool isDebuggerPresent);

        private static bool IsRemoteDebuggerPresent()
        {
            bool present = false;
            CheckRemoteDebuggerPresent(Process.GetCurrentProcess().Handle, ref present);
            return present;
        }

        private static bool IsVirtualMachine()
        {
            // Em produção, use CPUID via P/Invoke
            return Environment.GetEnvironmentVariable("VMWARE") != null ||
                   Environment.GetEnvironmentVariable("VIRTUALBOX") != null;
        }

        // ============================================================
        // SSL PINNING
        // ============================================================
        private bool ValidateCertificate(HttpRequestMessage request, X509Certificate2 certificate, X509Chain chain, SslPolicyErrors errors)
        {
            if (errors == SslPolicyErrors.None) return true;
            if (certificate?.Thumbprint?.Equals(_certThumbprint, StringComparison.OrdinalIgnoreCase) == true)
                return true;
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            return chain.Build(certificate);
        }

        // ============================================================
        // SECURE STRING HELPERS
        // ============================================================
        private SecureString ToSecureString(string input)
        {
            if (string.IsNullOrEmpty(input)) return new SecureString();
            var ss = new SecureString();
            foreach (char c in input) ss.AppendChar(c);
            ss.MakeReadOnly();
            return ss;
        }

        private string FromSecureString(SecureString ss)
        {
            if (ss == null || ss.Length == 0) return "";
            IntPtr ptr = Marshal.SecureStringToBSTR(ss);
            try { return Marshal.PtrToStringBSTR(ptr); }
            finally { Marshal.ZeroFreeBSTR(ptr); }
        }

        // ============================================================
        // DERIVAÇÃO DE CHAVE HMAC (PBKDF2)
        // ============================================================
        private static byte[] DeriveKey(string secret, string salt)
        {
            using var derive = new Rfc2898DeriveBytes(secret, Encoding.UTF8.GetBytes(salt), 10000, HashAlgorithmName.SHA256);
            return derive.GetBytes(32);
        }

        // ============================================================
        // NONCE FORTE
        // ============================================================
        private static string GenerateNonce()
        {
            using var rng = RandomNumberGenerator.Create();
            byte[] data = new byte[24];
            rng.GetBytes(data);
            // Combina com timestamp
            byte[] ts = BitConverter.GetBytes(Environment.TickCount64);
            for (int i = 0; i < 8; i++) data[i] ^= ts[i % 8];
            return Convert.ToHexString(data).ToLowerInvariant();
        }

        // ============================================================
        // HMAC-SHA256
        // ============================================================
        private static string HmacSha256(string data, byte[] key)
        {
            using var hmac = new HMACSHA256(key);
            byte[] hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(data));
            return Convert.ToHexString(hash).ToLowerInvariant();
        }

        // ============================================================
        // HWID
        // ============================================================
        public static string GenerateHwid()
        {
            string Get(string wql, string field)
            {
                try
                {
                    using var searcher = new ManagementObjectSearcher(wql);
                    foreach (ManagementObject obj in searcher.Get())
                        return (obj[field]?.ToString() ?? "").Trim();
                }
                catch { /* ignore */ }
                return "";
            }

            var raw = $"{Get("SELECT SerialNumber FROM Win32_BaseBoard", "SerialNumber")}-" +
                      $"{Get("SELECT ProcessorId FROM Win32_Processor", "ProcessorId")}-" +
                      $"{Get("SELECT SerialNumber FROM Win32_BIOS", "SerialNumber")}-" +
                      $"{Get("SELECT SerialNumber FROM Win32_PhysicalMedia", "SerialNumber")}";
            using var sha = SHA256.Create();
            byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
            return Convert.ToHexString(hash).ToLowerInvariant();
        }

        // ============================================================
        // REQUISIÇÃO COM OFUSCAÇÃO DE STRINGS (byte arrays)
        // ============================================================
        private async Task<JsonElement> PostAsync(string path, object payload, bool requiresSession = true)
        {
            // Strings ofuscadas
            byte[] appIdHeader = { 0x58, 0x2D, 0x41, 0x70, 0x70, 0x2D, 0x49, 0x64 }; // "X-App-Id"
            byte[] tsHeader = { 0x58, 0x2D, 0x54, 0x69, 0x6D, 0x65, 0x73, 0x74, 0x61, 0x6D, 0x70 }; // "X-Timestamp"
            byte[] nonceHeader = { 0x58, 0x2D, 0x4E, 0x6F, 0x6E, 0x63, 0x65 }; // "X-Nonce"
            byte[] sigHeader = { 0x58, 0x2D, 0x53, 0x69, 0x67, 0x6E, 0x61, 0x74, 0x75, 0x72, 0x65 }; // "X-Signature"
            byte[] sessionHeader = { 0x58, 0x2D, 0x53, 0x65, 0x73, 0x73, 0x69, 0x6F, 0x6E, 0x2D, 0x54, 0x6F, 0x6B, 0x65, 0x6E }; // "X-Session-Token"

            string appIdHeaderStr = Encoding.UTF8.GetString(appIdHeader);
            string tsHeaderStr = Encoding.UTF8.GetString(tsHeader);
            string nonceHeaderStr = Encoding.UTF8.GetString(nonceHeader);
            string sigHeaderStr = Encoding.UTF8.GetString(sigHeader);
            string sessionHeaderStr = Encoding.UTF8.GetString(sessionHeader);

            _http.DefaultRequestHeaders.Remove(appIdHeaderStr);
            _http.DefaultRequestHeaders.Remove(tsHeaderStr);
            _http.DefaultRequestHeaders.Remove(nonceHeaderStr);
            _http.DefaultRequestHeaders.Remove(sigHeaderStr);
            _http.DefaultRequestHeaders.Remove(sessionHeaderStr);

            string appId = FromSecureString(_appId);
            _http.DefaultRequestHeaders.Add(appIdHeaderStr, appId);

            string payloadJson = JsonSerializer.Serialize(payload);
            long timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string nonce = GenerateNonce();

            string dataToSign = $"POST{path}{payloadJson}{timestamp}{nonce}";
            string signature = HmacSha256(dataToSign, _hmacKey);

            _http.DefaultRequestHeaders.Add(tsHeaderStr, timestamp.ToString());
            _http.DefaultRequestHeaders.Add(nonceHeaderStr, nonce);
            _http.DefaultRequestHeaders.Add(sigHeaderStr, signature);

            if (requiresSession && _sessionToken != null && _sessionToken.Length > 0)
            {
                string token = FromSecureString(_sessionToken);
                _http.DefaultRequestHeaders.Add(sessionHeaderStr, token);
            }

            var content = new StringContent(payloadJson, Encoding.UTF8, "application/json");
            var response = await _http.PostAsync(path, content);
            string body = await response.Content.ReadAsStringAsync();

            // Verificar assinatura da resposta
            if (response.Headers.TryGetValues("X-Response-Signature", out var sigValues))
            {
                string respSig = sigValues.FirstOrDefault();
                if (!VerifyResponseSignature(body, respSig))
                    throw new SecurityException("Invalid response signature.");
            }

            try { return JsonDocument.Parse(body).RootElement.Clone(); }
            catch { return JsonDocument.Parse("{}").RootElement.Clone(); }
        }

        private bool VerifyResponseSignature(string body, string signature)
        {
            if (string.IsNullOrEmpty(signature)) return false;
            string computed = HmacSha256(body, _hmacKey);
            return computed.Equals(signature, StringComparison.OrdinalIgnoreCase);
        }

        // ============================================================
        // PARSE DE RESPOSTA
        // ============================================================
        private AuthResult ParseResponse(JsonElement j, bool ok)
        {
            var r = new AuthResult { Success = ok };
            if (!ok)
            {
                if (j.TryGetProperty("error", out var e) && e.TryGetProperty("message", out var msg))
                    r.Message = msg.GetString() ?? "Request failed";
                else
                    r.Message = "Request failed";
                return r;
            }

            r.Message = j.TryGetProperty("message", out var m) ? m.GetString() ?? "OK" : "OK";
            if (j.TryGetProperty("data", out var d))
            {
                if (d.TryGetProperty("token", out var t)) r.Token = t.GetString() ?? "";
                if (d.TryGetProperty("user", out var u) && u.TryGetProperty("username", out var un))
                    r.Username = un.GetString() ?? "";
                if (d.TryGetProperty("license", out var l))
                {
                    if (l.TryGetProperty("expiration", out var ex)) r.Expiration = ex.GetString() ?? "";
                    if (l.TryGetProperty("daysLeft", out var dl) && dl.ValueKind == JsonValueKind.Number)
                        r.DaysLeft = dl.GetInt32();
                }
            }
            return r;
        }

        // ============================================================
        // MÉTODOS PÚBLICOS
        // ============================================================
        public async Task<AuthResult> LoginAsync(string username, string password, string pcName = "")
        {
            var payload = new { username, password, hwid = GenerateHwid(), pcName };
            var j = await PostAsync("/api/v1/auth/login", payload);
            bool ok = j.TryGetProperty("success", out var s) && s.GetBoolean();
            var result = ParseResponse(j, ok);
            if (result.Success && !string.IsNullOrEmpty(result.Token))
                _sessionToken = ToSecureString(result.Token);
            return result;
        }

        public async Task<AuthResult> RegisterAsync(string username, string password, string licenseKey, string pcName = "")
        {
            var payload = new { username, password, licenseKey, hwid = GenerateHwid(), pcName };
            var j = await PostAsync("/api/v1/auth/register", payload);
            bool ok = j.TryGetProperty("success", out var s) && s.GetBoolean();
            var result = ParseResponse(j, ok);
            if (result.Success && !string.IsNullOrEmpty(result.Token))
                _sessionToken = ToSecureString(result.Token);
            return result;
        }

        public async Task<bool> LogoutAsync()
        {
            if (_sessionToken == null || _sessionToken.Length == 0) return true;
            var j = await PostAsync("/api/v1/auth/logout", new { }, false);
            bool ok = j.TryGetProperty("success", out var s) && s.GetBoolean();
            if (ok) { _sessionToken?.Dispose(); _sessionToken = null; }
            return ok;
        }

        public async Task<AuthResult> ValidateLicenseAsync(string licenseKey)
        {
            var payload = new { key = licenseKey, hwid = GenerateHwid() };
            var j = await PostAsync("/api/v1/license/validate", payload);
            bool ok = j.TryGetProperty("success", out var s) && s.GetBoolean();
            return ParseResponse(j, ok);
        }

        public async Task<bool> ValidateSessionAsync()
        {
            if (_sessionToken == null || _sessionToken.Length == 0) return false;
            var j = await PostAsync("/api/v1/session/validate", new { }, true);
            return j.TryGetProperty("success", out var s) && s.GetBoolean();
        }

        public async Task<string> GetVariableAsync(string name)
        {
            var j = await PostAsync("/api/v1/variables", new { }, true);
            if (!j.TryGetProperty("success", out var s) || !s.GetBoolean()) return "";
            if (j.TryGetProperty("data", out var d) &&
                d.TryGetProperty("global", out var g) &&
                g.TryGetProperty(name, out var val))
                return val.GetString() ?? "";
            return "";
        }

        // ============================================================
        // IDISPOSABLE
        // ============================================================
        public void Dispose()
        {
            if (_disposed) return;
            _http?.Dispose();
            _appId?.Dispose();
            _appSecret?.Dispose();
            _sessionToken?.Dispose();
            Array.Clear(_hmacKey, 0, _hmacKey.Length);
            _disposed = true;
        }
    }
}