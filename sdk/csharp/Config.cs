namespace SpectreAuth
{
    /// <summary>
    /// Configurações estáticas para o SDK de autenticação.
    /// Em produção, substitua os placeholders pelos valores reais da sua aplicação.
    /// </summary>
    public static class Config
    {
        // ============================================================
        // OPÇÕES DE REDE
        // ============================================================
        /// <summary>
        /// Timeout total da requisição (milissegundos)
        /// </summary>
        public const int REQUEST_TIMEOUT_MS = 15000;

        /// <summary>
        /// Timeout de conexão (milissegundos)
        /// </summary>
        public const int CONNECT_TIMEOUT_MS = 6000;

        /// <summary>
        /// Timeout de envio (milissegundos)
        /// </summary>
        public const int SEND_TIMEOUT_MS = 6000;

        // ============================================================
        // CREDENCIAIS – NÃO USE ESTAS VARIÁVEIS DIRETAMENTE.
        // Use o construtor que recebe appId e appSecret.
        // Estes placeholders são apenas para compilação.
        // ============================================================
        /// <summary>
        /// URL base da API (sem barra no final)
        /// </summary>
        public const string BASE_URL = "https://seu-dominio.com";

        /// <summary>
        /// Identificador público da aplicação (X-App-Id)
        /// </summary>
        public const string APP_ID = "pub_placeholder";

        /// <summary>
        /// Chave secreta da aplicação (X-App-Secret)
        /// </summary>
        public const string APP_SECRET = "sk_placeholder";

        // ============================================================
        // SSL PINNING
        // ============================================================
        /// <summary>
        /// Thumbprint do certificado (SHA-1) – substitua pelo seu
        /// </summary>
        public const string CERT_THUMBPRINT = "0123456789ABCDEF0123456789ABCDEF01234567";
    }
}