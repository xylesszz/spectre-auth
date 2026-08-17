#ifndef LICENSE_VALIDATOR_H
#define LICENSE_VALIDATOR_H

#include "Auth.hpp"
#include <string>

namespace Spectre {
    inline bool ValidateLicenseSecurely(Auth& auth, const std::string& licenseKey) {
        auto result = auth.ValidateLicense(licenseKey);
        return result.success;
    }
}
#endif