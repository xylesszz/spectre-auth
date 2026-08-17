#pragma once
#ifndef SPECTRE_CONFIG_H
#define SPECTRE_CONFIG_H

#include <string>

namespace Spectre {
    namespace Config {
        // ============================================================
        // OPÇÕES DE REDE (ajustáveis)
        // ============================================================
        inline constexpr int REQUEST_TIMEOUT_MS = 15000;
        inline constexpr int CONNECT_TIMEOUT_MS = 6000;
        inline constexpr int SEND_TIMEOUT_MS = 6000;

        // ============================================================
        // CREDENCIAIS – NÃO USE ESTAS VARIÁVEIS DIRETAMENTE.
        // Use o construtor que recebe appId e appSecret.
        // Estes placeholders são apenas para compilação.
        // ============================================================
        inline const std::string BASE_URL = "https://seu-dominio.com";
        inline const std::string APP_ID = "pub_placeholder";
        inline const std::string APP_SECRET = "sk_placeholder";
    }
}

#endif