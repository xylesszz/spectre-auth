#pragma once
#ifndef SPECTRE_AUTH_H
#define SPECTRE_AUTH_H

#include <string>
#include <memory>
#include <vector>
#include <chrono>
#include <cstdint>
#include <windows.h>
#include <wincrypt.h>

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
        Auth();  // usa Config.hpp
        ~Auth();

        bool Initialize(std::string& error);
        AuthResult Register(const std::string& username,
                            const std::string& password,
                            const std::string& licenseKey,
                            const std::string& pcName = "");
        AuthResult Login(const std::string& username,
                         const std::string& password,
                         const std::string& pcName = "");
        bool Logout();
        AuthResult ValidateLicense(const std::string& key);
        bool ValidateSession();
        std::string GetVariable(const std::string& name);

        static std::string GenerateHWID();
        const std::string& SessionToken() const { return m_sessionToken; }

    private:
        struct SecretStore;
        std::unique_ptr<SecretStore> m_credStore;
        std::string m_baseUrl;
        std::string m_sessionToken;
        std::vector<uint8_t> m_hmacKey;

        // Métodos de segurança
        static bool CheckEnvironment();  // anti‑debug + VM + ferramentas
        static bool ValidateCert(PCCERT_CONTEXT pCert);  // SSL pinning

        // Derivação de chave (PBKDF2 via BCrypt)
        static std::vector<uint8_t> DeriveKey(const std::string& secret, const std::string& salt);

        static std::string GenerateNonce();
        static std::string HmacSha256(const std::string& data, const std::vector<uint8_t>& key);
        std::string BuildAuthHeader(const std::string& method,
                                    const std::string& path,
                                    const std::string& body,
                                    long long timestamp,
                                    const std::string& nonce);

        bool Request(const std::string& method,
                     const std::string& path,
                     const std::string& body,
                     long& code,
                     std::string& out,
                     std::string& err);

        bool VerifyResponseSignature(const std::string& body, const std::string& signature);

        // Gerenciamento COM (para WMI)
        void InitCom();
        void UninitCom();
        bool m_comInitialized = false;
    };

} // namespace Spectre
#endif