#include "Auth.hpp"
#include <windows.h>
#include <winhttp.h>
#include <Wbemidl.h>
#include <comdef.h>
#include <bcrypt.h>
#include <vector>
#include <algorithm>
#include "Cfg/nlohmann/json.hpp"

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "wbemuuid.lib")
#pragma comment(lib, "bcrypt.lib")

using json = nlohmann::json;

namespace Spectre {

// ============================================================
// SHA256 via BCrypt (Windows)
// ============================================================
static std::string Sha256Hex(const std::string& input) {
    BCRYPT_ALG_HANDLE hAlg = NULL; BCRYPT_HASH_HANDLE hHash = NULL;
    DWORD objLen = 0, cb = 0, hashLen = 0;
    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0) != 0) return "";
    if (BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PUCHAR)&objLen, sizeof(DWORD), &cb, 0) != 0) { BCryptCloseAlgorithmProvider(hAlg, 0); return ""; }
    if (BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PUCHAR)&hashLen, sizeof(DWORD), &cb, 0) != 0) { BCryptCloseAlgorithmProvider(hAlg, 0); return ""; }
    std::vector<BYTE> obj(objLen);
    if (BCryptCreateHash(hAlg, &hHash, obj.data(), objLen, NULL, 0, 0) != 0) { BCryptCloseAlgorithmProvider(hAlg, 0); return ""; }
    if (BCryptHashData(hHash, (PUCHAR)input.data(), (ULONG)input.size(), 0) != 0) { BCryptDestroyHash(hHash); BCryptCloseAlgorithmProvider(hAlg, 0); return ""; }
    std::vector<BYTE> hash(hashLen);
    if (BCryptFinishHash(hHash, hash.data(), hashLen, 0) != 0) { BCryptDestroyHash(hHash); BCryptCloseAlgorithmProvider(hAlg, 0); return ""; }
    BCryptDestroyHash(hHash); BCryptCloseAlgorithmProvider(hAlg, 0);
    static const char* hex = "0123456789abcdef";
    std::string out; out.reserve(hash.size() * 2);
    for (unsigned char b : hash) { out.push_back(hex[(b >> 4) & 0xF]); out.push_back(hex[b & 0xF]); }
    return out;
}

// ============================================================
// WMI Query (para gerar HWID)
// ============================================================
static bool WmiSingle(const wchar_t* wql, const wchar_t* field, std::string& out) {
    out.clear();
    HRESULT hr = CoInitializeEx(0, COINIT_MULTITHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) return false;
    IWbemLocator* loc = nullptr; IWbemServices* svc = nullptr;
    hr = CoCreateInstance(CLSID_WbemLocator, 0, CLSCTX_INPROC_SERVER, IID_IWbemLocator, (LPVOID*)&loc);
    if (FAILED(hr)) { CoUninitialize(); return false; }
    hr = loc->ConnectServer(_bstr_t(L"ROOT\\CIMV2"), NULL, NULL, 0, 0, 0, 0, &svc);
    if (FAILED(hr)) { loc->Release(); CoUninitialize(); return false; }
    IEnumWbemClassObject* en = nullptr;
    hr = svc->ExecQuery(bstr_t("WQL"), bstr_t(wql), WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, NULL, &en);
    bool ok = false;
    if (SUCCEEDED(hr) && en) {
        IWbemClassObject* obj = nullptr; ULONG ret = 0;
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
    std::string h = Sha256Hex(raw);
    return h.empty() ? "unknown" : h;
}

// ============================================================
// HTTP Client via WinHTTP
// ============================================================
Auth::Auth(const std::string& baseUrl, const std::string& appId, const std::string& appSecret)
    : m_baseUrl(baseUrl), m_appId(appId), m_appSecret(appSecret) {
    while (!m_baseUrl.empty() && m_baseUrl.back() == '/') m_baseUrl.pop_back();
}

bool Auth::Request(const std::string& method, const std::string& path,
                   const std::string& body, long& code, std::string& out, std::string& err) {
    URL_COMPONENTS uc{}; uc.dwStructSize = sizeof(uc); uc.dwHostNameLength = 1; uc.dwUrlPathLength = 1;
    std::wstring wUrl(m_baseUrl.begin(), m_baseUrl.end());
    if (!WinHttpCrackUrl(wUrl.c_str(), 0, 0, &uc)) { err = "Invalid URL"; return false; }

    HINTERNET hSession = WinHttpOpen(L"SpectreAuth/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) { err = "WinHttpOpen failed"; return false; }

    std::wstring host(uc.lpszHostName, uc.dwHostNameLength);
    HINTERNET hConnect = WinHttpConnect(hSession, host.c_str(), uc.nPort, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); err = "Connect failed"; return false; }

    DWORD flags = (uc.nPort == INTERNET_DEFAULT_HTTPS_PORT) ? WINHTTP_FLAG_SECURE : 0;
    std::wstring wPath(uc.lpszUrlPath, uc.dwUrlPathLength);
    std::wstring wMethod(method.begin(), method.end());
    HINTERNET hReq = WinHttpOpenRequest(hConnect, wMethod.c_str(), wPath.c_str(), NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!hReq) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); err = "OpenRequest failed"; return false; }

    std::wstring headers = L"Content-Type: application/json\r\nAccept: application/json\r\n";
    headers += L"X-App-Id: " + std::wstring(m_appId.begin(), m_appId.end()) + L"\r\n";
    headers += L"X-App-Secret: " + std::wstring(m_appSecret.begin(), m_appSecret.end()) + L"\r\n";
    if (!m_sessionToken.empty())
        headers += L"X-Session-Token: " + std::wstring(m_sessionToken.begin(), m_sessionToken.end()) + L"\r\n";
    WinHttpAddRequestHeaders(hReq, headers.c_str(), (DWORD)headers.size(), WINHTTP_ADDREQ_FLAG_ADD);
    WinHttpSetTimeouts(hReq, 6000, 6000, 6000, 15000);

    BOOL sent = WinHttpSendRequest(hReq, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
        (LPVOID)body.c_str(), (DWORD)body.size(), (DWORD)body.size(), 0);
    if (!sent || !WinHttpReceiveResponse(hReq, nullptr)) {
        err = "Request failed: " + std::to_string(GetLastError());
        WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
        return false;
    }
    DWORD sc = 0, scSize = sizeof(sc);
    WinHttpQueryHeaders(hReq, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &sc, &scSize, WINHTTP_NO_HEADER_INDEX);
    code = (long)sc;

    DWORD avail = 0;
    do {
        avail = 0;
        if (!WinHttpQueryDataAvailable(hReq, &avail)) break;
        if (avail > 0) {
            std::vector<char> buf(avail);
            DWORD read = 0;
            if (WinHttpReadData(hReq, buf.data(), avail, &read)) out.append(buf.data(), read);
        }
    } while (avail > 0);

    WinHttpCloseHandle(hReq); WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession);
    return true;
}

// ============================================================
// Parse response
// ============================================================
static AuthResult ParseAuth(const std::string& body, bool ok) {
    AuthResult r; r.success = ok;
    json j = json::parse(body, nullptr, false);
    if (j.is_discarded()) { r.message = "Invalid JSON"; return r; }

    if (!ok) {
        if (j.contains("error") && j["error"].is_object()) {
            r.message = j["error"].value("message", "Request failed");
        } else {
            r.message = j.value("message", "Request failed");
        }
        return r;
    }

    r.message = j.value("message", "OK");
    if (j.contains("data")) {
        auto& d = j["data"];
        r.token = d.value("token", "");
        if (d.contains("user") && d["user"].is_object())
            r.username = d["user"].value("username", "");
        if (d.contains("license") && d["license"].is_object()) {
            r.expiration = d["license"].value("expiration", "");
            if (d["license"].contains("daysLeft") && d["license"]["daysLeft"].is_number_integer())
                r.daysLeft = d["license"]["daysLeft"].get<int>();
        }
    }
    return r;
}

// ============================================================
// Public methods
// ============================================================
bool Auth::Initialize(std::string& error) {
    long code = 0; std::string body, err;
    if (!Request("POST", "/api/v1/init", "{}", code, body, err)) { error = err; return false; }
    if (code < 200 || code >= 300) { error = ParseAuth(body, false).message; return false; }
    return true;
}

AuthResult Auth::Register(const std::string& username, const std::string& password,
                          const std::string& licenseKey, const std::string& pcName) {
    json p = {
        {"username", username}, {"password", password}, {"licenseKey", licenseKey},
        {"hwid", GenerateHWID()}, {"pcName", pcName}
    };
    long code = 0; std::string body, err;
    AuthResult r;
    if (!Request("POST", "/api/v1/auth/register", p.dump(), code, body, err)) { r.message = err; return r; }
    r = ParseAuth(body, code >= 200 && code < 300);
    if (r.success && !r.token.empty()) m_sessionToken = r.token;
    return r;
}

AuthResult Auth::Login(const std::string& username, const std::string& password, const std::string& pcName) {
    json p = { {"username", username}, {"password", password}, {"hwid", GenerateHWID()}, {"pcName", pcName} };
    long code = 0; std::string body, err;
    AuthResult r;
    if (!Request("POST", "/api/v1/auth/login", p.dump(), code, body, err)) { r.message = err; return r; }
    r = ParseAuth(body, code >= 200 && code < 300);
    if (r.success && !r.token.empty()) m_sessionToken = r.token;
    return r;
}

bool Auth::Logout() {
    long code = 0; std::string body, err;
    return Request("POST", "/api/v1/auth/logout", "{}", code, body, err) && code >= 200 && code < 300;
}

AuthResult Auth::ValidateLicense(const std::string& key) {
    json p = { {"key", key}, {"hwid", GenerateHWID()} };
    long code = 0; std::string body, err;
    if (!Request("POST", "/api/v1/license/validate", p.dump(), code, body, err)) { AuthResult r; r.message = err; return r; }
    return ParseAuth(body, code >= 200 && code < 300);
}

bool Auth::ValidateSession() {
    if (m_sessionToken.empty()) return false;
    long code = 0; std::string body, err;
    return Request("POST", "/api/v1/session/validate", "{}", code, body, err) && code >= 200 && code < 300;
}

std::string Auth::GetVariable(const std::string& name) {
    long code = 0; std::string body, err;
    if (!Request("POST", "/api/v1/variables", "{}", code, body, err) || code < 200 || code >= 300) return "";
    json j = json::parse(body, nullptr, false);
    if (j.is_discarded()) return "";
    if (j.contains("data") && j["data"].contains("global") && j["data"]["global"].contains(name))
        return j["data"]["global"][name].get<std::string>();
    return "";
}

} // namespace Spectre