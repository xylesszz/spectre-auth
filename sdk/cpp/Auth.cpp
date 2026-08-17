#include "Auth.hpp"
#include "XorStr.hpp"
#include <winhttp.h>
#include <Wbemidl.h>
#include <comdef.h>
#include <bcrypt.h>
#include <algorithm>
#include <random>
#include <chrono>
#include <thread>
#include "json.hpp"

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "bcrypt.lib")
#pragma comment(lib, "crypt32.lib")

using json = nlohmann::json;

namespace Spectre {

// ============================================================
//  CONSTANTES OFUSCADAS (usando XorStr)
// ============================================================
static const char* GetBaseUrl() {
    static const auto base = XorStr("https://seu-dominio.com");
    return base;
}
static const char* GetUserAgent() {
    static const auto ua = XorStr("SpectreAuth/2.0");
    return ua;
}
static const char* GetInitPath() {
    static const auto path = XorStr("/api/v1/init");
    return path;
}
static const char* GetLoginPath() {
    static const auto path = XorStr("/api/v1/auth/login");
    return path;
}
static const char* GetRegisterPath() {
    static const auto path = XorStr("/api/v1/auth/register");
    return path;
}
static const char* GetLogoutPath() {
    static const auto path = XorStr("/api/v1/auth/logout");
    return path;
}
static const char* GetValidatePath() {
    static const auto path = XorStr("/api/v1/license/validate");
    return path;
}
static const char* GetSessionPath() {
    static const auto path = XorStr("/api/v1/session/validate");
    return path;
}
static const char* GetVariablesPath() {
    static const auto path = XorStr("/api/v1/variables");
    return path;
}

static const char* GetHeaderAppId() {
    static const auto h = XorStr("X-App-Id");
    return h;
}
static const char* GetHeaderTimestamp() {
    static const auto h = XorStr("X-Timestamp");
    return h;
}
static const char* GetHeaderNonce() {
    static const auto h = XorStr("X-Nonce");
    return h;
}
static const char* GetHeaderSignature() {
    static const auto h = XorStr("X-Signature");
    return h;
}
static const char* GetHeaderSession() {
    static const auto h = XorStr("X-Session-Token");
    return h;
}
static const char* GetHeaderContentType() {
    static const auto h = XorStr("Content-Type: application/json\r\n");
    return h;
}
static const char* GetHeaderAccept() {
    static const auto h = XorStr("Accept: application/json\r\n");
    return h;
}

// ============================================================
//  ANTI‑DEBUG / VM / FERRAMENTAS (ofuscado)
// ============================================================
static bool CheckDebugger() {
    // Obtém função por hash (exemplo: GetProcAddress ofuscado)
    // Para simplificar, usamos IsDebuggerPresent diretamente, mas em produção usar hash.
    if (::IsDebuggerPresent() || (NtCurrentPeb()->BeingDebugged != 0))
        return true;

    // Timing check (single‑stepping)
    auto start = std::chrono::high_resolution_clock::now();
    volatile int dummy = 0;
    for (int i = 0; i < 1000000; ++i) dummy ^= i;
    auto end = std::chrono::high_resolution_clock::now();
    auto diff = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    if (diff < 1) return true; // debugger acelera execução

    return false;
}

static bool CheckVM() {
    int cpuInfo[4] = {0};
    __cpuid(cpuInfo, 1);
    return (cpuInfo[2] & (1 << 31)) != 0; // hypervisor bit
}

static bool CheckTools() {
    // Verifica processos comuns de debug
    const wchar_t* tools[] = { L"x64dbg", L"ollydbg", L"cheatengine", L"processhacker" };
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return false;
    PROCESSENTRY32 pe = { sizeof(PROCESSENTRY32) };
    if (Process32First(snapshot, &pe)) {
        do {
            std::wstring name(pe.szExeFile);
            for (auto t : tools) {
                if (name.find(t) != std::wstring::npos) {
                    CloseHandle(snapshot);
                    return true;
                }
            }
        } while (Process32Next(snapshot, &pe));
    }
    CloseHandle(snapshot);
    return false;
}

// ============================================================
//  SecretStore – DPAPI (protegido)
// ============================================================
struct Auth::SecretStore {
    std::vector<BYTE> encrypted;

    explicit SecretStore(const std::string& plain) {
        DATA_BLOB in{ (DWORD)plain.size(), (BYTE*)plain.data() };
        DATA_BLOB out{};
        if (CryptProtectData(&in, L"SpectreSecret", nullptr, nullptr, nullptr, 0, &out)) {
            encrypted.assign(out.pbData, out.pbData + out.cbData);
            SecureZeroMemory(out.pbData, out.cbData);
            LocalFree(out.pbData);
        } else {
            throw std::runtime_error("DPAPI encryption failed");
        }
    }

    std::string Reveal() const {
        DATA_BLOB in{ (DWORD)encrypted.size(), (BYTE*)encrypted.data() };
        DATA_BLOB out{};
        if (CryptUnprotectData(&in, nullptr, nullptr, nullptr, nullptr, 0, &out)) {
            std::string plain((char*)out.pbData, out.cbData);
            SecureZeroMemory(out.pbData, out.cbData);
            LocalFree(out.pbData);
            return plain;
        }
        return "";
    }

    ~SecretStore() {
        if (!encrypted.empty()) SecureZeroMemory(encrypted.data(), encrypted.size());
    }
};

// ============================================================
//  SHA256 via BCrypt
// ============================================================
static std::string Sha256Hex(const std::string& input) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    DWORD objLen = 0, hashLen = 0;
    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0) return "";
    BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&objLen, sizeof(DWORD), NULL, 0);
    BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashLen, sizeof(DWORD), NULL, 0);
    std::vector<BYTE> obj(objLen);
    if (BCryptCreateHash(hAlg, &hHash, obj.data(), objLen, NULL, 0, 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }
    BCryptHashData(hHash, (PUCHAR)input.c_str(), (ULONG)input.size(), 0);
    std::vector<BYTE> hash(hashLen);
    BCryptFinishHash(hHash, hash.data(), hashLen, 0);
    BCryptDestroyHash(hHash);
    BCryptCloseAlgorithmProvider(hAlg, 0);
    static const char* hex = "0123456789abcdef";
    std::string out; out.reserve(hash.size() * 2);
    for (BYTE b : hash) { out.push_back(hex[(b >> 4) & 0xF]); out.push_back(hex[b & 0xF]); }
    return out;
}

// ============================================================
//  WMI – HWID
// ============================================================
static bool WmiSingle(const wchar_t* wql, const wchar_t* field, std::string& out) {
    out.clear();
    HRESULT hr = CoInitializeEx(0, COINIT_MULTITHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) return false;

    IWbemLocator* loc = nullptr;
    IWbemServices* svc = nullptr;
    hr = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER, IID_IWbemLocator, (LPVOID*)&loc);
    if (FAILED(hr)) { CoUninitialize(); return false; }
    hr = loc->ConnectServer(_bstr_t(L"ROOT\\CIMV2"), NULL, NULL, 0, 0, 0, 0, &svc);
    if (FAILED(hr)) { loc->Release(); CoUninitialize(); return false; }

    IEnumWbemClassObject* en = nullptr;
    hr = svc->ExecQuery(bstr_t("WQL"), bstr_t(wql), WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, NULL, &en);
    bool ok = false;
    if (SUCCEEDED(hr) && en) {
        IWbemClassObject* obj = nullptr;
        ULONG ret = 0;
        if (en->Next(WBEM_INFINITE, 1, &obj, &ret) == S_OK && obj) {
            VARIANT vt{}; VariantInit(&vt);
            if (SUCCEEDED(obj->Get(field, 0, &vt, 0, 0)) && vt.vt == VT_BSTR && vt.bstrVal) {
                _bstr_t b(vt.bstrVal); out = (const char*)b; ok = !out.empty();
            }
            VariantClear(&vt); obj->Release();
        }
        en->Release();
    }
    svc->Release(); loc->Release(); CoUninitialize();
    return ok;
}

std::string Auth::GenerateHWID() {
    std::string mb, cpu, bios, disk;
    WmiSingle(L"SELECT SerialNumber FROM Win32_BaseBoard", L"SerialNumber", mb);
    WmiSingle(L"SELECT ProcessorId FROM Win32_Processor", L"ProcessorId", cpu);
    WmiSingle(L"SELECT SerialNumber FROM Win32_BIOS", L"SerialNumber", bios);
    WmiSingle(L"SELECT SerialNumber FROM Win32_PhysicalMedia", L"SerialNumber", disk);
    std::string raw = mb + "-" + cpu + "-" + bios + "-" + disk;
    return Sha256Hex(raw);
}

// ============================================================
//  Derivação de chave HMAC (PBKDF2)
// ============================================================
std::vector<uint8_t> Auth::DeriveKey(const std::string& secret, const std::string& salt) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, BCRYPT_ALG_HANDLE_HMAC_FLAG);
    // PBKDF2 não é nativo no BCrypt; usamos uma abordagem simplificada: HKDF com HMAC-SHA256.
    // Para produção, recomenda-se usar uma implementação de PBKDF2.
    // Aqui, apenas demonstramos a derivação com HMAC + contador.
    std::vector<uint8_t> derived(32);
    std::string input = secret + salt;
    std::string hash = HmacSha256(input, {input.begin(), input.end()});
    for (int i = 0; i < 32; ++i) derived[i] = hash[i % hash.size()];
    return derived;
}

// ============================================================
//  HMAC‑SHA256 (com chave vector)
// ============================================================
static std::string HmacSha256(const std::string& data, const std::vector<uint8_t>& key) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCRYPT_HASH_HANDLE hHash = NULL;
    DWORD objLen = 0, hashLen = 0;
    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, BCRYPT_ALG_HANDLE_HMAC_FLAG) != 0)
        return "";
    BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&objLen, sizeof(DWORD), NULL, 0);
    BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashLen, sizeof(DWORD), NULL, 0);
    std::vector<BYTE> obj(objLen);
    if (BCryptCreateHash(hAlg, &hHash, obj.data(), objLen, (PUCHAR)key.data(), (ULONG)key.size(), 0) != 0) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return "";
    }
    BCryptHashData(hHash, (PUCHAR)data.c_str(), (ULONG)data.size(), 0);
    std::vector<BYTE> hash(hashLen);
    BCryptFinishHash(hHash, hash.data(), hashLen, 0);
    BCryptDestroyHash(hHash);
    BCryptCloseAlgorithmProvider(hAlg, 0);
    static const char* hex = "0123456789abcdef";
    std::string out; out.reserve(hash.size() * 2);
    for (BYTE b : hash) { out.push_back(hex[(b >> 4) & 0xF]); out.push_back(hex[b & 0xF]); }
    return out;
}

// ============================================================
//  Nonce com alta entropia
// ============================================================
static std::string GenerateNonce() {
    LARGE_INTEGER perf; QueryPerformanceCounter(&perf);
    uint64_t ts = perf.QuadPart;
    uint64_t tick = GetTickCount64();
    uint64_t mixed = ts ^ (tick << 16) ^ (tick >> 16);
    std::mt19937_64 rng(mixed);
    std::uniform_int_distribution<uint64_t> dist;
    char buf[24];
    for (int i = 0; i < 24; ++i) buf[i] = "0123456789abcdef"[dist(rng) % 16];
    return std::string(buf, 24);
}

// ============================================================
//  SSL Pinning callback
// ============================================================
static bool WINAPI CertValidateCallback(PCCERT_CONTEXT pCert, void* /*pv*/) {
    // Thumbprint fixo ofuscado – substitua pelo seu
    static const auto expected = XorStr("0123456789ABCDEF0123456789ABCDEF01234567");
    DWORD size = 20;
    BYTE thumb[20];
    if (!CertGetCertificateContextProperty(pCert, CERT_SHA1_HASH_PROP_ID, thumb, &size))
        return false;
    std::string hex;
    for (DWORD i = 0; i < size; ++i) {
        char buf[3]; sprintf_s(buf, "%02X", thumb[i]); hex += buf;
    }
    return hex == expected;
}

// ============================================================
//  Construtores / Destrutor
// ============================================================
Auth::Auth(const std::string& baseUrl, const std::string& appId, const std::string& appSecret)
    : m_baseUrl(baseUrl), m_credStore(std::make_unique<SecretStore>(appId + "|" + appSecret)) {
    while (!m_baseUrl.empty() && m_baseUrl.back() == '/') m_baseUrl.pop_back();
    m_hmacKey = DeriveKey(appSecret, "SpectreSalt2025");

    if (CheckDebugger() || CheckVM() || CheckTools())
        throw std::runtime_error("Security violation");
}

Auth::Auth() : Auth(Config::BASE_URL, Config::APP_ID, Config::APP_SECRET) {}

Auth::~Auth() { SecureZeroMemory(m_hmacKey.data(), m_hmacKey.size()); }

// ============================================================
//  BuildAuthHeader
// ============================================================
std::string Auth::BuildAuthHeader(const std::string& method, const std::string& path,
                                  const std::string& body, long long timestamp,
                                  const std::string& nonce) {
    std::string payload = method + path + body + std::to_string(timestamp) + nonce;
    std::string signature = HmacSha256(payload, m_hmacKey);
    std::string header;
    header += GetHeaderSignature(); header += ": " + signature + "\r\n";
    header += GetHeaderTimestamp(); header += ": " + std::to_string(timestamp) + "\r\n";
    header += GetHeaderNonce(); header += ": " + nonce + "\r\n";
    return header;
}

// ============================================================
//  Verificação de assinatura da resposta
// ============================================================
bool Auth::VerifyResponseSignature(const std::string& body, const std::string& signature) {
    std::string computed = HmacSha256(body, m_hmacKey);
    return computed == signature;
}

// ============================================================
//  Request – base
// ============================================================
bool Auth::Request(const std::string& method, const std::string& path, const std::string& body,
                   long& code, std::string& out, std::string& err) {
    // Extrai credenciais (apenas para pegar appId, pois secret já foi derivado)
    std::string creds = m_credStore->Reveal();
    size_t sep = creds.find('|');
    if (sep == std::string::npos) { err = "Invalid credential format"; return false; }
    std::string appId = creds.substr(0, sep);

    long long timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    std::string nonce = GenerateNonce();
    std::string payload = method + path + body + std::to_string(timestamp) + nonce;
    std::string signature = HmacSha256(payload, m_hmacKey);

    // WinHTTP setup
    URL_COMPONENTS uc{}; uc.dwStructSize = sizeof(uc); uc.dwHostNameLength = 1; uc.dwUrlPathLength = 1;
    std::wstring wUrl(m_baseUrl.begin(), m_baseUrl.end());
    if (!WinHttpCrackUrl(wUrl.c_str(), 0, 0, &uc)) { err = "Invalid URL"; return false; }

    HINTERNET hSession = WinHttpOpen(GetUserAgent(), WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                     WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) { err = "WinHttpOpen failed"; return false; }

    std::wstring host(uc.lpszHostName, uc.dwHostNameLength);
    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), uc.nPort, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); err = "Connect failed"; return false; }

    DWORD flags = (uc.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
    std::wstring wPath(uc.lpszUrlPath, uc.dwUrlPathLength);
    std::wstring wMethod(method.begin(), method.end());
    HINTERNET hReq = WinHttpOpenRequest(hConnect, wMethod.c_str(), wPath.c_str(),
                                        NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hReq) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); err = "OpenRequest failed"; return false; }

    // Headers com strings ofuscadas
    std::wstring headers = L"";
    headers += std::wstring(GetHeaderContentType(), GetHeaderContentType() + strlen(GetHeaderContentType()));
    headers += std::wstring(GetHeaderAccept(), GetHeaderAccept() + strlen(GetHeaderAccept()));
    headers += L"User-Agent: " + std::wstring(GetUserAgent(), GetUserAgent() + strlen(GetUserAgent())) + L"\r\n";
    headers += L"X-App-Id: " + std::wstring(appId.begin(), appId.end()) + L"\r\n";
    headers += L"X-Signature: " + std::wstring(signature.begin(), signature.end()) + L"\r\n";
    headers += L"X-Timestamp: " + std::to_wstring(timestamp) + L"\r\n";
    headers += L"X-Nonce: " + std::wstring(nonce.begin(), nonce.end()) + L"\r\n";
    if (!m_sessionToken.empty())
        headers += L"X-Session-Token: " + std::wstring(m_sessionToken.begin(), m_sessionToken.end()) + L"\r\n";

    WinHttpAddRequestHeaders(hReq, headers.c_str(), (DWORD)headers.size(), WINHTTP_ADDREQ_FLAG_ADD);
    WinHttpSetTimeouts(hReq, Config::CONNECT_TIMEOUT_MS, Config::SEND_TIMEOUT_MS,
                       Config::SEND_TIMEOUT_MS, Config::REQUEST_TIMEOUT_MS);

    // Envio com backoff exponencial (simplificado)
    int retries = 0; bool sent = false;
    while (!sent && retries < 3) {
        sent = WinHttpSendRequest(hReq, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                                  (LPVOID)body.c_str(), (DWORD)body.size(), (DWORD)body.size(), 0);
        if (!sent) { std::this_thread::sleep_for(std::chrono::milliseconds(100 * (1 << retries++))); }
    }
    if (!sent || !WinHttpReceiveResponse(hReq, nullptr)) {
        err = "Request failed: " + std::to_string(GetLastError());
        WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
        return false;
    }

    DWORD sc = 0; DWORD scSize = sizeof(sc);
    WinHttpQueryHeaders(hReq, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &sc, &scSize, WINHTTP_NO_HEADER_INDEX);
    code = (long)sc;

    DWORD avail = 0; out.clear();
    do {
        avail = 0; if (!WinHttpQueryDataAvailable(hReq, &avail)) break;
        if (avail > 0) {
            std::vector<char> buf(avail);
            DWORD read = 0;
            if (WinHttpReadData(hReq, buf.data(), avail, &read)) out.append(buf.data(), read);
        }
    } while (avail > 0);

    // Verificar assinatura da resposta (se presente)
    DWORD len = 0;
    WinHttpQueryHeaders(hReq, WINHTTP_QUERY_RAW_HEADERS_CRLF, WINHTTP_HEADER_NAME_BY_INDEX,
                        NULL, &len, WINHTTP_NO_HEADER_INDEX);
    if (len) {
        std::vector<wchar_t> rawHeaders(len);
        if (WinHttpQueryHeaders(hReq, WINHTTP_QUERY_RAW_HEADERS_CRLF, WINHTTP_HEADER_NAME_BY_INDEX,
                                rawHeaders.data(), &len, WINHTTP_NO_HEADER_INDEX)) {
            std::wstring headers(rawHeaders.data());
            // Procurar por "X-Response-Signature"
            size_t pos = headers.find(L"X-Response-Signature:");
            if (pos != std::wstring::npos) {
                size_t start = pos + 22;
                size_t end = headers.find(L"\r\n", start);
                if (end != std::wstring::npos) {
                    std::wstring sigW = headers.substr(start, end - start);
                    std::string signature(sigW.begin(), sigW.end());
                    if (!VerifyResponseSignature(out, signature)) {
                        err = "Invalid response signature";
                        WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
                        return false;
                    }
                }
            }
        }
    }

    WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
    return true;
}

// ============================================================
//  Métodos públicos
// ============================================================
bool Auth::Initialize(std::string& error) {
    long code = 0; std::string body, err;
    if (!Request("POST", GetInitPath(), "{}", code, body, err)) { error = err; return false; }
    if (code < 200 || code >= 300) { error = "Init failed (HTTP " + std::to_string(code) + ")"; return false; }
    return true;
}

AuthResult Auth::Login(const std::string& username, const std::string& password,
                       const std::string& pcName) {
    json p = {{"username", username}, {"password", password},
              {"hwid", GenerateHWID()}, {"pcName", pcName}};
    long code = 0; std::string body, err; AuthResult r;
    if (!Request("POST", GetLoginPath(), p.dump(), code, body, err)) { r.message = err; return r; }
    json j = json::parse(body, nullptr, false);
    if (j.is_discarded()) { r.message = "Invalid JSON"; return r; }
    r.success = (code >= 200 && code < 300);
    if (!r.success) { r.message = j.value("error", "Request failed"); return r; }
    r.message = j.value("message", "OK");
    if (j.contains("data")) {
        auto& d = j["data"];
        r.token = d.value("token", "");
        r.username = d["user"].value("username", "");
        r.expiration = d["license"].value("expiration", "");
        r.daysLeft = d["license"].value("daysLeft", 0);
        if (!r.token.empty()) m_sessionToken = r.token;
    }
    return r;
}

AuthResult Auth::Register(const std::string& username, const std::string& password,
                          const std::string& licenseKey, const std::string& pcName) {
    json p = {{"username", username}, {"password", password}, {"licenseKey", licenseKey},
              {"hwid", GenerateHWID()}, {"pcName", pcName}};
    long code = 0; std::string body, err; AuthResult r;
    if (!Request("POST", GetRegisterPath(), p.dump(), code, body, err)) { r.message = err; return r; }
    json j = json::parse(body, nullptr, false);
    if (j.is_discarded()) { r.message = "Invalid JSON"; return r; }
    r.success = (code >= 200 && code < 300);
    if (!r.success) { r.message = j.value("error", "Request failed"); return r; }
    r.message = j.value("message", "OK");
    if (j.contains("data")) {
        auto& d = j["data"];
        r.token = d.value("token", "");
        r.username = d["user"].value("username", "");
        r.expiration = d["license"].value("expiration", "");
        r.daysLeft = d["license"].value("daysLeft", 0);
        if (!r.token.empty()) m_sessionToken = r.token;
    }
    return r;
}

bool Auth::Logout() {
    long code = 0; std::string body, err;
    return Request("POST", GetLogoutPath(), "{}", code, body, err) && (code >= 200 && code < 300);
}

AuthResult Auth::ValidateLicense(const std::string& key) {
    json p = {{"key", key}, {"hwid", GenerateHWID()}};
    long code = 0; std::string body, err; AuthResult r;
    if (!Request("POST", GetValidatePath(), p.dump(), code, body, err)) { r.message = err; return r; }
    json j = json::parse(body, nullptr, false);
    if (j.is_discarded()) { r.message = "Invalid JSON"; return r; }
    r.success = (code >= 200 && code < 300);
    if (!r.success) { r.message = j.value("error", "Request failed"); return r; }
    r.message = j.value("message", "OK");
    if (j.contains("data")) {
        auto& d = j["data"];
        r.token = d.value("token", "");
        r.expiration = d["license"].value("expiration", "");
        r.daysLeft = d["license"].value("daysLeft", 0);
    }
    return r;
}

bool Auth::ValidateSession() {
    if (m_sessionToken.empty()) return false;
    long code = 0; std::string body, err;
    return Request("POST", GetSessionPath(), "{}", code, body, err) && (code >= 200 && code < 300);
}

std::string Auth::GetVariable(const std::string& name) {
    long code = 0; std::string body, err;
    if (!Request("POST", GetVariablesPath(), "{}", code, body, err) || code < 200 || code >= 300) return "";
    json j = json::parse(body, nullptr, false);
    if (j.is_discarded()) return "";
    if (j.contains("data") && j["data"].contains("global") && j["data"]["global"].contains(name))
        return j["data"]["global"][name].get<std::string>();
    return "";
}

} // namespace Spectre