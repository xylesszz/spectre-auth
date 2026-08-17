#ifndef FW_XORSTR_HPP
#define FW_XORSTR_HPP

#if defined(_M_ARM64) || defined(__aarch64__) || defined(_M_ARM) || defined(__arm__)
#include <arm_neon.h>
#elif defined(_M_X64) || defined(__amd64__) || defined(_M_IX86) || defined(__i386__)
#include <immintrin.h>
#else
#error Unsupported platform
#endif

#include <cstdint>
#include <cstddef>
#include <utility>
#include <type_traits>
#include <cstdlib> // para alloca

#ifdef _MSC_VER
#define FW_FORCEINLINE __forceinline
#define FW_NOINLINE   __declspec(noinline)
#pragma warning(push)
#pragma warning(disable : 4244 4307 4702)
#else
#define FW_FORCEINLINE __attribute__((always_inline)) inline
#define FW_NOINLINE    __attribute__((noinline))
#endif

// ============================================================================
//  Macros — cada call-site gera chaves únicas via __COUNTER__ + __LINE__ + __TIME__
// ============================================================================

#define xorstr(str)                                                            \
    ::FrameWork::xor_string(                                                   \
        []() { return str; },                                                  \
        std::integral_constant<std::size_t, sizeof(str) / sizeof(*str)>{},     \
        std::make_index_sequence<                                              \
            ::FrameWork::XorStr::_buffer_size<sizeof(str)>()>{},               \
        std::integral_constant<std::uint32_t, __COUNTER__>{},                  \
        std::integral_constant<std::uint32_t, __LINE__>{})

#define xorstr_(str)    xorstr(str).crypt_get()
#define XorStr(str)     xorstr_(str)

namespace FrameWork {
    namespace XorStr {

        // ============================================================================
        //  Tamanho do buffer (alinhado a 16 bytes)
        // ============================================================================
        template<std::size_t Size>
        FW_FORCEINLINE constexpr std::size_t _buffer_size()
        {
            return ((Size / 16) + (Size % 16 != 0)) * 2;
        }

        // ============================================================================
        //  Geração de chave com salt extra (__DATE__, __TIME__, constante)
        // ============================================================================
        namespace detail {
            FW_FORCEINLINE constexpr std::uint32_t murmur_mix(std::uint32_t h) noexcept {
                h ^= h >> 16;
                h *= 0x85ebca6bu;
                h ^= h >> 13;
                h *= 0xc2b2ae35u;
                h ^= h >> 16;
                return h;
            }
            FW_FORCEINLINE constexpr std::uint64_t murmur_mix64(std::uint64_t k) noexcept {
                k ^= k >> 33;
                k *= 0xff51afd7ed558ccdULL;
                k ^= k >> 33;
                k *= 0xc4ceb9fe1a85ec53ULL;
                k ^= k >> 33;
                return k;
            }
        } // namespace detail

        template<std::uint32_t Seed, std::uint32_t Counter, std::uint32_t Line>
        FW_FORCEINLINE constexpr std::uint32_t key4() noexcept {
            std::uint32_t value = Seed;
            value ^= detail::murmur_mix(Counter);
            value ^= detail::murmur_mix(Line * 2654435761u);
            // Salt adicional: __DATE__ e __TIME__
            for (char c : __DATE__) value = (value ^ static_cast<std::uint32_t>(c)) * 16777619u;
            for (char c : __TIME__) value = (value ^ static_cast<std::uint32_t>(c)) * 16777619u;
            // Constante fixa para dificultar
            value ^= 0x9E3779B9;
            return detail::murmur_mix(value);
        }

        template<std::size_t S, std::uint32_t Counter, std::uint32_t Line>
        FW_FORCEINLINE constexpr std::uint64_t key8() {
            constexpr auto lo = key4<2166136261u + static_cast<std::uint32_t>(S), Counter, Line>();
            constexpr auto hi = key4<lo, Counter ^ 0xDEADBEEF, Line ^ 0xCAFEBABE>();
            return detail::murmur_mix64(
                (static_cast<std::uint64_t>(hi) << 32) | static_cast<std::uint64_t>(lo));
        }

        // ============================================================================
        //  Carregar string XORed
        // ============================================================================
        template<std::size_t N, class CharT>
        FW_FORCEINLINE constexpr std::uint64_t
            load_xored_str8(std::uint64_t key, std::size_t idx, const CharT* str) noexcept {
            using cast_type = typename std::make_unsigned<CharT>::type;
            constexpr auto value_size = sizeof(CharT);
            constexpr auto idx_offset = 8 / value_size;
            std::uint64_t value = key;
            for (std::size_t i = 0; i < idx_offset && i + idx * idx_offset < N; ++i)
                value ^= (std::uint64_t{ static_cast<cast_type>(str[i + idx * idx_offset]) }
                         << ((i % idx_offset) * 8 * value_size));
            return value;
        }

        // ============================================================================
        //  Anti-optimizer
        // ============================================================================
        FW_FORCEINLINE std::uint64_t load_from_reg(std::uint64_t value) noexcept {
#if defined(__clang__) || defined(__GNUC__)
            asm volatile("" : "=r"(value) : "0"(value) : "memory");
            return value;
#else
            volatile std::uint64_t reg = value;
            _ReadWriteBarrier();
            return reg;
#endif
        }

        // ============================================================================
        //  Secure zero com barreira de memória
        // ============================================================================
        FW_FORCEINLINE void secure_zero(volatile void* ptr, std::size_t size) noexcept {
            volatile std::uint8_t* p = static_cast<volatile std::uint8_t*>(ptr);
            while (size--) *p++ = 0;
#if defined(__clang__) || defined(__GNUC__)
            asm volatile("" ::: "memory");
#else
            _ReadWriteBarrier();
#endif
        }

    } // namespace XorStr

    // ============================================================================
    //  Classe core xor_string
    // ============================================================================
    template<class CharT, std::size_t Size, class Keys, class Indices>
    class xor_string;

    template<class CharT, std::size_t Size, std::uint64_t... Keys, std::size_t... Indices>
    class xor_string<CharT, Size,
        std::integer_sequence<std::uint64_t, Keys...>,
        std::index_sequence<Indices...>>
    {
        static constexpr std::size_t alignment = 16;
        alignas(alignment) std::uint64_t _storage[sizeof...(Keys)];
        bool _decrypted = false;

    public:
        using value_type = CharT;
        using size_type = std::size_t;
        using pointer = CharT*;
        using const_pointer = const CharT*;

        template<class L, std::uint32_t C, std::uint32_t Ln>
        FW_FORCEINLINE xor_string(
            L l,
            std::integral_constant<std::size_t, Size>,
            std::index_sequence<Indices...>,
            std::integral_constant<std::uint32_t, C>,
            std::integral_constant<std::uint32_t, Ln>) noexcept
            : _storage{
                XorStr::load_from_reg(
                    (std::integral_constant<std::uint64_t,
                        XorStr::load_xored_str8<Size>(Keys, Indices, l())
                    >::value))...
            }
        {}

        FW_FORCEINLINE constexpr size_type size() const noexcept { return Size - 1; }

        // ========================================================================
        //  Ofuscação das chaves com operações não lineares
        // ========================================================================
    private:
        FW_FORCEINLINE static void _obfuscate_keys(std::uint64_t* keys, std::size_t count) noexcept {
#if defined(_M_ARM64) || defined(__aarch64__) || defined(_M_ARM) || defined(__arm__)
            for (std::size_t i = 0; i < count; i += 2) {
                uint64x2_t k = vld1q_u64(keys + i);
                k = veorq_u64(k, vdupq_n_u64(0x9E3779B97F4A7C15ULL));
                k = vaddq_u64(k, vdupq_n_u64(0x85EBCA6B));
                vst1q_u64(keys + i, k);
            }
#else
            // x86 SSE2
            std::size_t blocks = count / 2;
            const __m128i mask = _mm_set1_epi64x(0x9E3779B97F4A7C15ULL);
            const __m128i add = _mm_set1_epi64x(0x85EBCA6B);
            for (std::size_t i = 0; i < blocks; ++i) {
                __m128i k = _mm_load_si128(reinterpret_cast<const __m128i*>(keys) + i);
                k = _mm_xor_si128(k, mask);
                k = _mm_add_epi64(k, add);
                _mm_store_si128(reinterpret_cast<__m128i*>(keys) + i, k);
            }
#endif
        }

    public:
        // ========================================================================
        //  Descriptografar in-place
        // ========================================================================
        FW_FORCEINLINE void crypt() noexcept {
            // Alocar chaves em stack com alloca (limpa depois)
            std::uint64_t* keys = static_cast<std::uint64_t*>(_alloca(sizeof...(Keys) * sizeof(std::uint64_t)));
            if (!keys) {
                // fallback para array estático
                alignas(alignment) std::uint64_t keysStatic[]{ XorStr::load_from_reg(Keys)... };
                keys = keysStatic;
            } else {
                for (std::size_t i = 0; i < sizeof...(Keys); ++i)
                    keys[i] = XorStr::load_from_reg(Keys);
            }

            _obfuscate_keys(keys, sizeof...(Keys));

#if defined(_M_ARM64) || defined(__aarch64__) || defined(_M_ARM) || defined(__arm__)
            ((Indices >= sizeof(_storage) / 16 ? static_cast<void>(0) : vst1q_u64(
                reinterpret_cast<uint64_t*>(_storage) + Indices * 2,
                veorq_u64(
                    vld1q_u64(reinterpret_cast<const uint64_t*>(_storage) + Indices * 2),
                    vld1q_u64(reinterpret_cast<const uint64_t*>(keys) + Indices * 2))
            )), ...);
#else
            ((Indices >= sizeof(_storage) / 16 ? static_cast<void>(0) : _mm_store_si128(
                reinterpret_cast<__m128i*>(_storage) + Indices,
                _mm_xor_si128(
                    _mm_load_si128(reinterpret_cast<const __m128i*>(_storage) + Indices),
                    _mm_load_si128(reinterpret_cast<const __m128i*>(keys) + Indices))
            )), ...);
#endif
            // Limpar chaves (se alocadas dinamicamente)
            if (keys && keys != static_cast<std::uint64_t*>(_alloca(0))) {
                XorStr::secure_zero(keys, sizeof...(Keys) * sizeof(std::uint64_t));
            }
            _decrypted = true;
        }

        FW_FORCEINLINE void wipe() noexcept {
            XorStr::secure_zero(_storage, sizeof(_storage));
            _decrypted = false;
        }

        FW_FORCEINLINE const_pointer get() const noexcept { return reinterpret_cast<const_pointer>(_storage); }
        FW_FORCEINLINE pointer get() noexcept { return reinterpret_cast<pointer>(_storage); }
        FW_FORCEINLINE pointer crypt_get() noexcept { crypt(); return reinterpret_cast<pointer>(_storage); }

        template<typename F>
        FW_FORCEINLINE auto use(F&& fn) noexcept(noexcept(fn(std::declval<const_pointer>())))
            -> decltype(fn(std::declval<const_pointer>())) {
            crypt();
            if constexpr (std::is_void_v<decltype(fn(get()))>) {
                fn(get());
                wipe();
            } else {
                auto result = fn(get());
                wipe();
                return result;
            }
        }

        ~xor_string() noexcept { if (_decrypted) wipe(); }
    };

    // Deduction guide
    template<class L, std::size_t Size, std::size_t... Indices,
        std::uint32_t Counter, std::uint32_t Line>
    xor_string(
        L l,
        std::integral_constant<std::size_t, Size>,
        std::index_sequence<Indices...>,
        std::integral_constant<std::uint32_t, Counter>,
        std::integral_constant<std::uint32_t, Line>)
        -> xor_string<
        std::remove_const_t<std::remove_reference_t<decltype(l()[0])>>,
        Size,
        std::integer_sequence<std::uint64_t,
        XorStr::key8<Indices, Counter, Line>()...>,
        std::index_sequence<Indices...>>;

} // namespace FrameWork

#ifdef _MSC_VER
#pragma warning(pop)
#endif

#endif // FW_XORSTR_HPP