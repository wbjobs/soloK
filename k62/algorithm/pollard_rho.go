package algorithm

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"
	"sync"
)

var (
	zero = big.NewInt(0)
	one  = big.NewInt(1)
	two  = big.NewInt(2)
)

func FactorizeWithContext(ctx context.Context, n *big.Int) ([]*big.Int, error) {
	if n.Cmp(one) <= 0 {
		return nil, errors.New("input must be greater than 1")
	}
	var factors []*big.Int
	err := factorizeRecursiveWithContext(ctx, n, &factors)
	if err != nil {
		return nil, err
	}
	return factors, nil
}

func FactorizeStringsWithContext(ctx context.Context, numStr string) ([]string, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	n, ok := new(big.Int).SetString(numStr, 10)
	if !ok {
		return nil, errors.New("invalid number format: " + numStr)
	}
	factors, err := FactorizeWithContext(ctx, n)
	if err != nil {
		return nil, err
	}
	result := make([]string, len(factors))
	for i, f := range factors {
		result[i] = f.String()
	}
	return result, nil
}

func FactorizeStrings(numStr string) ([]string, error) {
	return FactorizeStringsWithContext(context.Background(), numStr)
}

func factorizeRecursive(n *big.Int, factors *[]*big.Int) {
	if n.Cmp(one) == 0 {
		return
	}
	if n.ProbablyPrime(20) {
		*factors = append(*factors, new(big.Int).Set(n))
		return
	}
	if n.BitLen() <= 64 {
		smallFactors := trialDivide(n)
		*factors = append(*factors, smallFactors...)
		return
	}
	d := pollardRho(n)
	if d == nil {
		*factors = append(*factors, new(big.Int).Set(n))
		return
	}
	factorizeRecursive(d, factors)
	factorizeRecursive(new(big.Int).Div(n, d), factors)
}

func factorizeRecursiveWithContext(ctx context.Context, n *big.Int, factors *[]*big.Int) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	if n.Cmp(one) == 0 {
		return nil
	}
	if n.ProbablyPrime(20) {
		*factors = append(*factors, new(big.Int).Set(n))
		return nil
	}
	if n.BitLen() <= 64 {
		smallFactors := trialDivide(n)
		*factors = append(*factors, smallFactors...)
		return nil
	}
	d, err := pollardRhoWithContext(ctx, n)
	if err != nil {
		return err
	}
	if d == nil {
		*factors = append(*factors, new(big.Int).Set(n))
		return nil
	}
	if err := factorizeRecursiveWithContext(ctx, d, factors); err != nil {
		return err
	}
	return factorizeRecursiveWithContext(ctx, new(big.Int).Div(n, d), factors)
}

func trialDivide(n *big.Int) []*big.Int {
	var factors []*big.Int
	d := big.NewInt(2)
	temp := new(big.Int)
	for temp.Mul(d, d).Cmp(n) <= 0 {
		for new(big.Int).Mod(n, d).Cmp(zero) == 0 {
			factors = append(factors, new(big.Int).Set(d))
			n.Div(n, d)
		}
		d.Add(d, one)
	}
	if n.Cmp(one) > 0 {
		factors = append(factors, new(big.Int).Set(n))
	}
	return factors
}

func pollardRho(n *big.Int) *big.Int {
	if new(big.Int).Mod(n, two).Cmp(zero) == 0 {
		return new(big.Int).Set(two)
	}
	for attempt := 0; attempt < 20; attempt++ {
		x := randBigInt(n)
		c := randBigInt(n)
		y := new(big.Int).Set(x)
		d := big.NewInt(1)

		f := func(val *big.Int) *big.Int {
			result := new(big.Int)
			result.Mul(val, val)
			result.Add(result, c)
			result.Mod(result, n)
			return result
		}

		for d.Cmp(one) == 0 {
			x = f(x)
			y = f(f(y))
			diff := new(big.Int).Sub(x, y)
			diff.Abs(diff)
			d.GCD(nil, nil, diff, n)
		}

		if d.Cmp(one) > 0 && d.Cmp(n) < 0 {
			return d
		}
	}
	return nil
}

func pollardRhoWithContext(ctx context.Context, n *big.Int) (*big.Int, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	if new(big.Int).Mod(n, two).Cmp(zero) == 0 {
		return new(big.Int).Set(two), nil
	}
	for attempt := 0; attempt < 20; attempt++ {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		x := randBigInt(n)
		c := randBigInt(n)
		y := new(big.Int).Set(x)
		d := big.NewInt(1)

		f := func(val *big.Int) *big.Int {
			result := new(big.Int)
			result.Mul(val, val)
			result.Add(result, c)
			result.Mod(result, n)
			return result
		}

		iterCount := 0
		for d.Cmp(one) == 0 {
			iterCount++
			if iterCount%100 == 0 {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				default:
				}
			}
			x = f(x)
			y = f(f(y))
			diff := new(big.Int).Sub(x, y)
			diff.Abs(diff)
			d.GCD(nil, nil, diff, n)
		}

		if d.Cmp(one) > 0 && d.Cmp(n) < 0 {
			return d, nil
		}
	}
	return nil, nil
}

func randBigInt(max *big.Int) *big.Int {
	n := new(big.Int).Sub(max, one)
	if n.Cmp(one) <= 0 {
		return big.NewInt(1)
	}
	result, err := rand.Int(rand.Reader, n)
	if err != nil {
		return big.NewInt(2)
	}
	result.Add(result, two)
	return result
}

type FactorizeJob struct {
	Number string
}

type FactorizeResult struct {
	Number  string
	Factors []string
	Error   string
}

func WorkerPool(numbers []string, concurrency int) []FactorizeResult {
	results := make([]FactorizeResult, len(numbers))
	jobs := make(chan int, len(numbers))
	var wg sync.WaitGroup

	if concurrency <= 0 {
		concurrency = 4
	}

	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range jobs {
				numStr := numbers[idx]
				factors, err := FactorizeStrings(numStr)
				r := FactorizeResult{Number: numStr}
				if err != nil {
					r.Error = err.Error()
				} else {
					r.Factors = factors
				}
				results[idx] = r
			}
		}()
	}

	for i := range numbers {
		jobs <- i
	}
	close(jobs)
	wg.Wait()

	return results
}

func IsPrime(numStr string) bool {
	n, ok := new(big.Int).SetString(numStr, 10)
	if !ok {
		return false
	}
	return n.ProbablyPrime(20)
}
