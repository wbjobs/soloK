#!/usr/bin/env python3
import argparse
import numpy as np
from typing import Optional, Tuple

def normalize_state(state: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(state)
    return state / norm if norm != 0 else state

def get_initial_state(basis: str, num_qubits: int = 1) -> np.ndarray:
    if num_qubits not in [1, 2, 3]:
        raise ValueError(f"Only 1-3 qubit systems supported, got {num_qubits}")
    if len(basis) != num_qubits or not all(c in '01' for c in basis):
        raise ValueError(f"Invalid basis: {basis} for {num_qubits} qubits")
    dim = 2 ** num_qubits
    state = np.zeros(dim, dtype=complex)
    idx = int(basis, 2)
    state[idx] = 1
    return state

def state_to_density_matrix(state: np.ndarray) -> np.ndarray:
    return np.outer(state, state.conj())

def get_hadamard_gate() -> np.ndarray:
    return np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)

def get_pauli_x_gate() -> np.ndarray:
    return np.array([[0, 1], [1, 0]], dtype=complex)

def build_cnot_gate(control: int, target: int, num_qubits: int = 2) -> np.ndarray:
    dim = 2 ** num_qubits
    gate = np.zeros((dim, dim), dtype=complex)
    for i in range(dim):
        if (i >> control) & 1:
            j = i ^ (1 << target)
        else:
            j = i
        gate[j, i] = 1
    return gate

DJ_ORACLE_TYPES = {
    'constant-0': 'constant',
    'constant-1': 'constant',
    'balanced-x0': 'balanced',
    'balanced-x1': 'balanced',
    'balanced-xor': 'balanced',
}

def build_dj_oracle(oracle_type: str, num_input_qubits: int = 2) -> Tuple[np.ndarray, str]:
    n = num_input_qubits
    total = n + 1
    ancilla = n
    dim = 2 ** total
    oracle = np.eye(dim, dtype=complex)

    if oracle_type == 'constant-0':
        return oracle, 'constant'

    elif oracle_type == 'constant-1':
        x_on_ancilla = apply_single_qubit_gate(
            np.eye(dim, dtype=complex), get_pauli_x_gate(), ancilla, total
        )
        return x_on_ancilla, 'constant'

    elif oracle_type == 'balanced-x0':
        cnot = build_cnot_gate(0, ancilla, total)
        return cnot, 'balanced'

    elif oracle_type == 'balanced-x1':
        cnot = build_cnot_gate(1, ancilla, total)
        return cnot, 'balanced'

    elif oracle_type == 'balanced-xor':
        cnot1 = build_cnot_gate(0, ancilla, total)
        cnot2 = build_cnot_gate(1, ancilla, total)
        return cnot2 @ cnot1, 'balanced'

    else:
        raise ValueError(f"Unknown oracle type: {oracle_type}. "
                         f"Choose from: {', '.join(DJ_ORACLE_TYPES.keys())}")

def run_deutsch_jozsa(oracle_type: str, num_input_qubits: int = 2,
                      verbose: bool = True) -> dict:
    n = num_input_qubits
    total = n + 1
    ancilla = n

    init_basis = '1' + '0' * n
    state = get_initial_state(init_basis, total)
    if verbose:
        print(f"\n{'='*50}")
        print(f"  Deutsch-Jozsa Algorithm ({n} input + 1 ancilla = {total} qubits)")
        print(f"  Oracle: {oracle_type}")
        print(f"{'='*50}")
        print_complex_array(state, "Step 0: Initial state |0...0>|1>")

    for q in range(total):
        state = apply_single_qubit_gate(state, get_hadamard_gate(), q, total)
    state = normalize_state(state)
    if verbose:
        print_complex_array(state, "Step 1: After H on all qubits")

    oracle_matrix, oracle_class = build_dj_oracle(oracle_type, n)
    state = oracle_matrix @ state
    state = normalize_state(state)
    if verbose:
        print_complex_array(state, f"Step 2: After oracle U_f ({oracle_type})")

    for q in range(n):
        state = apply_single_qubit_gate(state, get_hadamard_gate(), q, total)
    state = normalize_state(state)
    if verbose:
        print_complex_array(state, "Step 3: After H on input qubits")

    input_probs = np.zeros(2 ** n)
    for i in range(2 ** total):
        input_idx = i & ((1 << n) - 1)
        input_probs[input_idx] += np.abs(state[i]) ** 2

    measured_input = np.argmax(input_probs)
    measured_basis = format(measured_input, f'0{n}b')

    is_constant = (measured_input == 0)
    predicted = 'constant' if is_constant else 'balanced'
    correct = (predicted == oracle_class)

    result = {
        'oracle_type': oracle_type,
        'oracle_class': oracle_class,
        'predicted': predicted,
        'correct': correct,
        'measured_input': measured_basis,
        'input_probabilities': {
            format(i, f'0{n}b'): input_probs[i] for i in range(2 ** n)
        },
        'final_state': state,
    }

    if verbose:
        print(f"\n{'='*50}")
        print(f"  Algorithm Result")
        print(f"{'='*50}")
        print(f"  Oracle type:          {oracle_type}")
        print(f"  Oracle true class:    {oracle_class}")
        print(f"  Measured input bits:  |{measured_basis}>")
        print(f"  Predicted class:      {predicted}")
        print(f"  Correct:              {'YES' if correct else 'NO'}")
        print(f"\n  Input qubit probability distribution:")
        for bits, prob in result['input_probabilities'].items():
            bar = '#' * int(prob * 40)
            print(f"    |{bits}>: {prob:.6f}  {bar}")
        print(f"\n  Verification: "
              f"{'|0...0> => constant, else => balanced' if True else ''}")
        print(f"  Measured |{measured_basis}> => "
              f"{'constant' if is_constant else 'balanced'} "
              f"(actual: {oracle_class})")
        print(f"{'='*50}")

    return result

def apply_single_qubit_gate(state: np.ndarray, gate: np.ndarray, 
                            target_qubit: int, num_qubits: int) -> np.ndarray:
    full_gate = 1
    for i in range(num_qubits):
        if i == (num_qubits - 1 - target_qubit):
            full_gate = np.kron(full_gate, gate)
        else:
            full_gate = np.kron(full_gate, np.eye(2))
    return full_gate @ state

def apply_gate(state: np.ndarray, gate_name: str, 
               target_qubit: int = 0, control_qubit: Optional[int] = None) -> np.ndarray:
    num_qubits = int(np.log2(len(state)))
    
    if gate_name.lower() == 'hadamard':
        gate = get_hadamard_gate()
        return apply_single_qubit_gate(state, gate, target_qubit, num_qubits)
    elif gate_name.lower() == 'pauli-x':
        gate = get_pauli_x_gate()
        return apply_single_qubit_gate(state, gate, target_qubit, num_qubits)
    elif gate_name.lower() == 'cnot':
        if num_qubits < 2:
            raise ValueError("CNOT gate requires at least 2 qubits")
        ctrl = control_qubit if control_qubit is not None else 0
        tgt = target_qubit
        if tgt == ctrl:
            tgt = 1 if ctrl == 0 else 0
        cnot = build_cnot_gate(ctrl, tgt, num_qubits)
        return cnot @ state
    else:
        raise ValueError(f"Unknown gate: {gate_name}")

def measure_state(state: np.ndarray, num_samples: int = 1000) -> dict:
    probabilities = np.abs(state) ** 2
    probabilities = probabilities / np.sum(probabilities)
    num_qubits = int(np.log2(len(state)))
    outcomes = [format(i, f'0{num_qubits}b') for i in range(len(state))]
    
    samples = np.random.choice(outcomes, size=num_samples, p=probabilities)
    counts = {outcome: int(np.sum(samples == outcome)) for outcome in outcomes}
    
    return {
        'probabilities': {outcome: prob for outcome, prob in zip(outcomes, probabilities)},
        'counts': counts,
        'num_samples': num_samples
    }

def get_bloch_coordinates(state: np.ndarray) -> Optional[Tuple[float, float, float]]:
    if len(state) != 2:
        return None
    
    alpha, beta = state[0], state[1]
    rho = state_to_density_matrix(state)
    
    sigma_x = np.array([[0, 1], [1, 0]], dtype=complex)
    sigma_y = np.array([[0, -1j], [1j, 0]], dtype=complex)
    sigma_z = np.array([[1, 0], [0, -1]], dtype=complex)
    
    x = float(np.real(np.trace(rho @ sigma_x)))
    y = float(np.real(np.trace(rho @ sigma_y)))
    z = float(np.real(np.trace(rho @ sigma_z)))
    
    return (x, y, z)

def print_complex_array(arr: np.ndarray, label: str):
    print(f"\n{label}:")
    for i, val in enumerate(arr):
        re = val.real
        im = val.imag
        if abs(im) < 1e-10:
            print(f"  |{format(i, f'0{int(np.log2(len(arr)))}b')}>: {re:.6f}")
        elif abs(re) < 1e-10:
            print(f"  |{format(i, f'0{int(np.log2(len(arr)))}b')}>: {im:.6f}j")
        else:
            sign = '+' if im >= 0 else '-'
            print(f"  |{format(i, f'0{int(np.log2(len(arr)))}b')}>: {re:.6f} {sign} {abs(im):.6f}j")

def print_density_matrix(rho: np.ndarray):
    print("\nDensity Matrix:")
    n = rho.shape[0]
    for i in range(n):
        row_str = "  ["
        for j in range(n):
            val = rho[i, j]
            re = val.real
            im = val.imag
            if abs(im) < 1e-10:
                row_str += f"{re:.4f}".rjust(10)
            elif abs(re) < 1e-10:
                row_str += f"{im:.4f}j".rjust(10)
            else:
                sign = '+' if im >= 0 else '-'
                row_str += f"{re:.2f}{sign}{abs(im):.2f}j".rjust(10)
        print(row_str + "]")

def main():
    parser = argparse.ArgumentParser(description='Quantum Bit Simulator CLI Tool')
    parser.add_argument('--basis', type=str, default='0', 
                        help='Initial basis state (|0>, |1>, |00>, |01>, |10>, |11>, |000>...|111>)')
    parser.add_argument('--gate', type=str, action='append', default=[],
                        help='Quantum gate to apply (Hadamard, Pauli-X, CNOT). Can be used multiple times.')
    parser.add_argument('--measure', action='store_true',
                        help='Perform measurement and show distribution')
    parser.add_argument('--bloch', action='store_true',
                        help='Output Bloch sphere coordinates (single qubit only)')
    parser.add_argument('--density', action='store_true',
                        help='Show density matrix representation')
    parser.add_argument('--samples', type=int, default=1000,
                        help='Number of measurement samples (default: 1000)')
    parser.add_argument('--target-qubit', type=int, default=0,
                        help='Target qubit for gates (default: 0)')
    parser.add_argument('--control-qubit', type=int, default=0,
                        help='Control qubit for CNOT gate (default: 0)')
    parser.add_argument('--deutsch-jozsa', type=str, default=None,
                        metavar='ORACLE',
                        help=f'Run Deutsch-Jozsa algorithm with specified oracle. '
                             f'Choices: {", ".join(DJ_ORACLE_TYPES.keys())}. '
                             f'Use "all" to test all oracles.')
    
    args = parser.parse_args()
    
    if args.deutsch_jozsa is not None:
        if args.deutsch_jozsa == 'all':
            print("\n" + "=" * 50)
            print("  Deutsch-Jozsa: Testing ALL oracle types")
            print("=" * 50)
            results = {}
            all_correct = True
            for oracle_type, true_class in DJ_ORACLE_TYPES.items():
                result = run_deutsch_jozsa(oracle_type, verbose=True)
                results[oracle_type] = result
                if not result['correct']:
                    all_correct = False
            
            print(f"\n{'='*50}")
            print(f"  Summary: All Oracles Verification")
            print(f"{'='*50}")
            for oracle_type, result in results.items():
                status = "PASS" if result['correct'] else "FAIL"
                print(f"  [{status}] {oracle_type:15s} => "
                      f"predicted: {result['predicted']:9s}, "
                      f"actual: {result['oracle_class']:9s}")
            print(f"\n  Overall: {'ALL PASSED' if all_correct else 'SOME FAILED'}")
            print(f"{'='*50}")
        else:
            run_deutsch_jozsa(args.deutsch_jozsa, verbose=True)
        return
    
    basis_clean = args.basis.replace('|', '').replace('>', '')
    num_qubits = len(basis_clean)
    
    if num_qubits not in [1, 2, 3]:
        print("Error: Only 1, 2, or 3 qubit systems are supported")
        return
    
    state = get_initial_state(basis_clean, num_qubits)
    state = normalize_state(state)
    
    for gate in args.gate:
        state = apply_gate(state, gate, args.target_qubit, args.control_qubit)
        state = normalize_state(state)
    
    print(f"\n=== Quantum Simulation Results ===")
    print(f"Number of qubits: {num_qubits}")
    print(f"Initial basis: |{basis_clean}>")
    if args.gate:
        print(f"Gates applied: {', '.join(args.gate)}")
    
    print_complex_array(state, "State Vector (Probability Amplitudes)")
    
    if args.density:
        rho = state_to_density_matrix(state)
        print_density_matrix(rho)
    
    if args.bloch:
        coords = get_bloch_coordinates(state)
        if coords:
            print(f"\nBloch Sphere Coordinates:")
            print(f"  x: {coords[0]:.6f}")
            print(f"  y: {coords[1]:.6f}")
            print(f"  z: {coords[2]:.6f}")
        else:
            print("\nBloch sphere only available for single qubit systems")
    
    if args.measure:
        result = measure_state(state, args.samples)
        print(f"\nMeasurement Results ({args.samples} samples):")
        print("  Probabilities:")
        for outcome, prob in result['probabilities'].items():
            print(f"    |{outcome}>: {prob:.4f} ({prob*100:.2f}%)")
        print("  Measurement Counts:")
        for outcome, count in result['counts'].items():
            print(f"    |{outcome}>: {count}")
    
    print()

if __name__ == '__main__':
    main()
