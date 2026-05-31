var globalCounter = 0;
var globalCache = {};
var globalConfig = {};

function longFunctionWithManyParams(a, b, c, d, e, f, g, h) {
    var result = 0;
    for (var i = 0; i < 100; i++) {
        result += i;
        result += a;
        result += b;
        result += c;
        result += d;
        result += e;
        result += f;
        result += g;
        result += h;
        if (result % 2 === 0) {
            result = result * 2;
        } else {
            result = result * 3;
        }
        console.log("Current result: " + result);
        globalCounter++;
        if (globalCounter % 10 === 0) {
            console.log("Counter reached multiple of 10");
        }
    }
    var data = [];
    for (var j = 0; j < 50; j++) {
        data.push(j * 2);
    }
    var processed = [];
    for (var k = 0; k < data.length; k++) {
        processed.push(data[k] + 10);
    }
    var final = processed.reduce(function(sum, val) { return sum + val; }, 0);
    console.log("Final sum: " + final);
    return result;
}

function anotherDuplicateFunction(a, b, c, d, e, f, g, h) {
    var result = 0;
    for (var i = 0; i < 100; i++) {
        result += i;
        result += a;
        result += b;
        result += c;
        result += d;
        result += e;
        result += f;
        result += g;
        result += h;
        if (result % 2 === 0) {
            result = result * 2;
        } else {
            result = result * 3;
        }
        console.log("Current result: " + result);
        globalCounter++;
        if (globalCounter % 10 === 0) {
            console.log("Counter reached multiple of 10");
        }
    }
    var data = [];
    for (var j = 0; j < 50; j++) {
        data.push(j * 2);
    }
    var processed = [];
    for (var k = 0; k < data.length; k++) {
        processed.push(data[k] + 10);
    }
    var final = processed.reduce(function(sum, val) { return sum + val; }, 0);
    console.log("Final sum: " + final);
    return result;
}

class VeryLargeClass {
    constructor() {
        this.data1 = [];
        this.data2 = {};
        this.data3 = new Set();
        this.config1 = null;
        this.config2 = null;
        this.config3 = null;
    }
    
    method1() {}
    method2() {}
    method3() {}
    method4() {}
    method5() {}
    method6() {}
    method7() {}
    method8() {}
    method9() {}
    method10() {}
    method11() {}
    method12() {}
    method13() {}
    method14() {}
    method15() {}
    method16() {}
}

function processUserData(name, email, age, address, phone, city, country) {
    return name + " - " + email + " - " + age + " - " + address;
}

function saveUserData(name, email, age, address, phone, city, country) {
    var data = name + "," + email + "," + age + "," + address;
    localStorage.setItem('user', data);
}

function validateUserData(name, email, age, address, phone, city, country) {
    if (!name || !email || !age) {
        return false;
    }
    return true;
}
