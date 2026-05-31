package algorithm

import (
	"crypto/rand"
	"math/big"
)

func MillerRabinTest(n *big.Int, rounds int) bool {
	if n.Cmp(big.NewInt(2)) < 0 {
		return false
	}
	if n.Cmp(big.NewInt(2)) == 0 {
		return true
	}
	if new(big.Int).Mod(n, big.NewInt(2)).Cmp(big.NewInt(0)) == 0 {
		return false
	}
	if n.Cmp(big.NewInt(3)) == 0 {
		return true
	}

	nMinusOne := new(big.Int).Sub(n, big.NewInt(1))
	d := new(big.Int).Set(nMinusOne)
	s := 0
	for new(big.Int).Mod(d, big.NewInt(2)).Cmp(big.NewInt(0)) == 0 {
		d.Rsh(d, 1)
		s++
	}

	for i := 0; i < rounds; i++ {
		a, err := rand.Int(rand.Reader, new(big.Int).Sub(n, big.NewInt(3)))
		if err != nil {
			return false
		}
		a.Add(a, big.NewInt(2))

		x := new(big.Int).Exp(a, d, n)

		if x.Cmp(big.NewInt(1)) == 0 || x.Cmp(nMinusOne) == 0 {
			continue
		}

		composite := true
		for j := 1; j < s; j++ {
			x.Exp(x, big.NewInt(2), n)
			if x.Cmp(nMinusOne) == 0 {
				composite = false
				break
			}
			if x.Cmp(big.NewInt(1)) == 0 {
				return false
			}
		}
		if composite {
			return false
		}
	}
	return true
}

func VerifyFactorization(numberStr string, factorStrs []string) bool {
	n, ok := new(big.Int).SetString(numberStr, 10)
	if !ok || n.Cmp(big.NewInt(1)) <= 0 {
		return false
	}

	product := big.NewInt(1)
	for _, fs := range factorStrs {
		f, ok := new(big.Int).SetString(fs, 10)
		if !ok {
			return false
		}
		if f.Cmp(big.NewInt(2)) < 0 {
			return false
		}
		if !MillerRabinTest(f, 40) {
			return false
		}
		product.Mul(product, f)
	}

	return product.Cmp(n) == 0
}
