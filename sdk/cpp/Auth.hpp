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
    // Inicializa com a URL da Vercel + credenciais da Application (dashboard → Applications)
    Auth(const std::string& baseUrl, const std::string& appId, const std::string& appSecret);

    // Checa se a API está online
    bool Initialize(std::string& error);

    // Registra um novo usuário com licença
    AuthResult Register(const std::string& username, const std::string& password,
                        const std::string& licenseKey, const std::string& pcName = "");

    // Faz login (cria sessão)
    AuthResult Login(const std::string& username, const std::string& password,
                     const std::string& pcName = "");

    // Encerra a sessão
    bool Logout();

    // Valida uma licença (sem criar sessão)
    AuthResult ValidateLicense(const std::string& key);

    // Valida se a sessão atual ainda é válida
    bool ValidateSession();

    // Busca uma variável global da aplicação
    std::string GetVariable(const std::string& name);

    // Gera o HWID da máquina (WMI + SHA256)
    static std::string GenerateHWID();

    // Token da sessão (usado em chamadas subsequentes)
    const std::string& SessionToken() const { return m_sessionToken; }

private:
    std::string m_baseUrl, m_appId, m_appSecret, m_sessionToken;

    bool Request(const std::string& method, const std::string& path,
                 const std::string& body, long& code, std::string& out, std::string& err);
};

} // namespace Spectre
#endif