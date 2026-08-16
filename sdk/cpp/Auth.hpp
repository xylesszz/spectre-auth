#pragma once
#ifndef SPECTRE_AUTH_H
#define SPECTRE_AUTH_H
#include <string>

namespace Spectre {
struct AuthResult {
    bool success = false;
    std::string message;
    std::string token;
    std::string username;
    std::string expiration;
    int daysLeft = 0;
};

class Auth {
public:
    Auth(const std::string& baseUrl, const std::string& appId, const std::string& appSecret);

    bool Initialize(std::string& error);
    AuthResult Register(const std::string& username, const std::string& password, const std::string& licenseKey, const std::string& pcName = "");
    AuthResult Login(const std::string& username, const std::string& password, const std::string& pcName = "");
    bool Logout();
    AuthResult ValidateLicense(const std::string& key);
    bool ValidateSession();
    std::string GetVariable(const std::string& name);

    static std::string GenerateHWID();
    const std::string& SessionToken() const { return m_sessionToken; }

private:
    std::string m_baseUrl, m_appId, m_appSecret, m_sessionToken;
    bool Request(const std::string& method, const std::string& path, const std::string& body, long& code, std::string& out, std::string& err);
};
}
#endif