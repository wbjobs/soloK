import numpy as np
from numpy.distutils.core import setup, Extension

fortran_ext = Extension(
    name='radtran_solver',
    sources=['src/fortran/radtran_solver.f90'],
    extra_f90_compile_args=['-O3', '-fopenmp'],
    extra_link_args=['-fopenmp']
)

setup(
    name='radtran',
    version='1.0.0',
    description='放射性核素在地下水中迁移预测工具',
    author='RadTran Team',
    packages=['radtran'],
    package_dir={'radtran': 'src/python'},
    ext_modules=[fortran_ext],
    include_dirs=[np.get_include()],
    entry_points={
        'console_scripts': [
            'radtran=radtran.cli:main',
        ],
    },
    install_requires=[
        'numpy>=1.21.0',
        'matplotlib>=3.5.0',
        'scipy>=1.7.0',
        'pyevtk>=1.5.0',
        'geojson>=2.5.0',
        'tqdm>=4.62.0',
        'pyyaml>=6.0',
    ],
)
