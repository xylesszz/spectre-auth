using System.Management;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

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
        public string SessionToken { get; private set; } = "";

        public SpectreAuthClient(string baseUrl, string appId, string appSecret)
        {
            _http = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/')), Timeout = TimeSpan.FromSeconds(15) };
            _http.DefaultRequestHeaders.Add("X-App-Id", appId);
            _http.DefaultRequestHeaders.Add("X-App-Secret", appSecret);
        }

        public static string GenerateHwid()
        {
            string Get(string wql, string field)
            {
                try
                {
                    using (var s = new ManagementObjectSearcher(wql))
                        foreach (var o in s.Get())
                            return (o[field]?.ToString() ?? "").Trim();
                }
                catch { }
                return "";
            }
            var raw = $"{Get("SELECT SerialNumber FROM Win32_BaseBoard", "SerialNumber")}-{Get("SELECT ProcessorId FROM Win32_Processor", "ProcessorId")}-{Get("SELECT SerialNumber FROM Win32_BIOS", "SerialNumber")}-{Get("SELECT SerialNumber FROM Win32_PhysicalMedia", "SerialNumber")}";
            using (var sha = SHA256.Create())
            {
                var sb = new StringBuilder();
                foreach (var b in sha.ComputeHash(Encoding.UTF8.GetBytes(raw))) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        private async Task<JsonElement> Post(string path, object payload)
        {
            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            if (!string.IsNullOrEmpty(SessionToken))
            {
                if (_http.DefaultRequestHeaders.Contains("X-Session-Token")) _http.DefaultRequestHeaders.Remove("X-Session-Token");
                _http.DefaultRequestHeaders.Add("X-Session-Token", SessionToken);
            }
            var resp = await _http.PostAsync(path, content);
            var body = await resp.Content.ReadAsStringAsync();
            try { return JsonDocument.Parse(body).RootElement.Clone(); }
            catch { return JsonDocument.Parse("{}").RootElement.Clone(); }
        }

        private static AuthResult Parse(JsonElement j, bool ok)
        {
            var r = new AuthResult { Success = ok };
            if (!ok) { r.Message = j.TryGetProperty("error", out var e) ? e.GetProperty("message").GetString() ?? "Failed" : "Failed"; return r; }
            r.Message = j.TryGetProperty("message", out var m) ? m.GetString() ?? "OK" : "OK";
            if (j.TryGetProperty("data", out var d))
            {
                if (d.TryGetProperty("token", out var t)) r.Token = t.GetString() ?? "";
                if (d.TryGetProperty("user", out var u) && u.TryGetProperty("username", out var un)) r.Username = un.GetString() ?? "";
                if (d.TryGetProperty("license", out var l))
                {
                    if (l.TryGetProperty("expiration", out var ex)) r.Expiration = ex.GetString() ?? "";
                    if (l.TryGetProperty("daysLeft", out var dl) && dl.ValueKind == JsonValueKind.Number) r.DaysLeft = dl.GetInt32();
                }
            }
            return r;
        }

        public async Task<AuthResult> InitializeAsync()
        {
            var j = await Post("/api/v1/init", new { });
            return Parse(j, j.TryGetProperty("success", out var s) && s.GetBoolean());
        }

        public async Task<AuthResult> RegisterAsync(string username, string password, string licenseKey, string pcName = "")
        {
            var j = await Post("/api/v1/auth/register", new { username, password, licenseKey, hwid = GenerateHwid(), pcName });
            var r = Parse(j, j.TryGetProperty("success", out var s) && s.GetBoolean());
            if (r.Success) SessionToken = r.Token;
            return r;
        }

        public async Task<AuthResult> LoginAsync(string username, string password, string pcName = "")
        {
            var j = await Post("/api/v1/auth/login", new { username, password, hwid = GenerateHwid(), pcName });
            var r = Parse(j, j.TryGetProperty("success", out var s) && s.GetBoolean());
            if (r.Success) SessionToken = r.Token;
            return r;
        }

        public async Task<AuthResult> LogoutAsync()
        {
            var j = await Post("/api/v1/auth/logout", new { });
            return Parse(j, j.TryGetProperty("success", out var s) && s.GetBoolean());
        }

        public async Task<AuthResult> ValidateLicenseAsync(string key)
        {
            var j = await Post("/api/v1/license/validate", new { key, hwid = GenerateHwid() });
            return Parse(j, j.TryGetProperty("success", out var s) && s.GetBoolean());
        }

        public async Task<AuthResult> ValidateSessionAsync()
        {
            var j = await Post("/api/v1/session/validate", new { });
            return Parse(j, j.TryGetProperty("success", out var s) && s.GetBoolean());
        }

        public async Task<string> GetVariableAsync(string name)
        {
            var j = await Post("/api/v1/variables", new { });
            if (j.TryGetProperty("data", out var d) && d.TryGetProperty("global", out var g) && g.TryGetProperty(name, out var v))
                return v.GetString() ?? "";
            return "";
        }

        public void Dispose() => _http?.Dispose();
    }
}