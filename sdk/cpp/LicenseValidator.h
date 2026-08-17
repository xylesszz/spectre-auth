#ifndef LICENSE_VALIDATOR_H
#define LICENSE_VALIDATOR_H

#include "Auth.hpp"
#include <string>

namespace Spectre {
    /*
     * SECURITY FIX: O validador offline anterior usava XOR com a chave embutida no payload.
     * Isso permitia que qualquer usuário forjasse licenças válidas.
     * 
     * Validação de licença offline simétrica (AES/XOR) é MATEMATICAMENTE INSEGURA em software de cliente.
     * Para validação offline real, o servidor deve assinar a licença com Ed25519/RSA e o cliente
     * deve verificar a assinatura usando uma chave pública hardcoded.
     * 
     * Abaixo está o wrapper seguro para validação ONLINE obrigatória.
     */
    inline bool ValidateLicenseSecurely(Auth& auth, const std::string& licenseKey) {
        auto result = auth.ValidateLicense(licenseKey);
        return result.success;
    }
}
#endif // LICENSE_VALIDATOR_H