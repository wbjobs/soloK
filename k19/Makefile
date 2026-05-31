.PHONY: all build clean test

all: build

build:
	python setup.py build_ext --inplace

clean:
	rm -rf build/
	rm -f radtran_solver*.pyd
	rm -f radtran_solver*.so
	rm -f src/fortran/*.mod

test: build
	python -m pytest tests/ -v
