from setuptools import setup, find_packages

setup(
    name='coal-spontaneous-combustion',
    version='1.0.0',
    description='煤自燃倾向性鉴定命令行工具',
    author='Coal Analysis Team',
    packages=find_packages(),
    install_requires=[
        'numpy>=1.21.0',
        'scipy>=1.7.0',
        'scikit-learn>=1.0.0',
        'matplotlib>=3.4.0',
        'pandas>=1.3.0',
        'reportlab>=3.6.0',
        'click>=8.0.0',
        'openpyxl>=3.0.0',
    ],
    entry_points={
        'console_scripts': [
            'coal-analysis=coal_spontaneous_combustion.cli:main',
        ],
    },
    python_requires='>=3.8',
)
