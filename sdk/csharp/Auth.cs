using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Security.Cryptography;
using System.Management;

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
        private readonly string _appId;
        private readonly string _appSecret;

        public SpectreAuthClient(string baseUrl, string appId, string appSecret)
        {
            // SECURITY: Enforce HTTPS strictly
            if (!baseUrl.StartsWith("https://") && !baseUrl.StartsWith("http://localhost")) 
                throw new ArgumentException("HTTPS is mandatory for production.");
            
            _appId = appId;
            _appSecret = appSecret;
            
            _http = new HttpClient { 
                BaseAddress = new Uri(baseUrl.TrimEnd('/')), 
                Timeout = TimeSpan.FromSeconds(15) 
            };
        }

        public static string GenerateHwid()
        {
            string Get(string wql, string f) { 
                try { 
                    using (var s = new ManagementObjectSearcher(wql)) 
                        foreach (var o in s.Get()) 
                            return (o[f]?.ToString() ?? "").Trim(); 
                } catch { return ""; } 
            }
            
            var raw = $"{Get("SELECT SerialNumber FROM Win32_BaseBoard","SerialNumber")}-" +
                      $"{Get("SELECT ProcessorId FROM Win32_Processor","ProcessorId")}-" +
                      $"{Get("SELECT SerialNumber FROM Win32_BIOS","SerialNumber")}-" +
                      $"{Get("SELECT SerialNumber FROM Win32_PhysicalMedia","SerialNumber")}";
                      
            using (var sha = SHA256.Create()) { 
                var sb = new StringBuilder(); 
                foreach (var b in sha.ComputeHash(Encoding.UTF8.GetBytes(raw))) 
                    sb.Append(b.ToString("x2")); 
                return sb.ToString(); 
            }
        }

        private async Task<JsonElement> Post(string path, object payload)
        {
            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            
            // Clear and re-add headers securely
            if (_http.DefaultRequestHeaders.Contains("X-App-Id")) _http.DefaultRequestHeaders.Remove("X-App-Id");
            if (_http.DefaultRequestHeaders.Contains("X-App-Secret")) _http.DefaultRequestHeaders.Remove("X-App-Secret");
            if (_http.DefaultRequestHeaders.Contains("X-Session-Token")) _http.DefaultRequestHeaders.Remove("X-Session-Token");
            
            _http.DefaultRequestHeaders.Add("X-App-Id", _appId);
            _http.DefaultRequestHeaders.Add("X-App-Secret", _appSecret);
            if (!string.IsNullOrEmpty(SessionToken)) 
                _http.DefaultRequestHeaders.Add("X-Session-Token", SessionToken);

            var resp = await _http.PostAsync(path, content);
            var body = await resp.Content.ReadAsStringAsync();
            try { return JsonDocument.Parse(body).RootElement.Clone(); }
            catch { return JsonDocument.Parse("{}").RootElement.Clone(); }
        }

        // ... (Métodos LoginAsync, RegisterAsync, etc. mantêm a lógica de parse, 
        // mas REMOVEM qualquer chamada para SendLoginWebhook)
        
        public async Task<AuthResult> LoginAsync(string username, string password, string pcName = "")
        {
            var j = await Post("/api/v1/auth/login", new { username, password, hwid = GenerateHwid(), pcName });
            var ok = j.TryGetProperty("success", out var s) && s.GetBoolean();
            var r = Parse(j, ok);
            if (r.Success) SessionToken = r.Token;
            return r;
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

        public void Dispose() => _http?.Dispose();
    }
}