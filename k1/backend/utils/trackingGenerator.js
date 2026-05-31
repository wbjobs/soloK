function generateTrackingNumber() {
  const prefix = 'PK';
  const randomPart = Math.floor(Math.random() * 900000000000 + 100000000000).toString();
  const baseNumber = prefix + randomPart.substring(0, 12);
  
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    const char = baseNumber[i];
    const value = isNaN(char) ? char.charCodeAt(0) - 55 : parseInt(char);
    const weight = i % 2 === 0 ? 1 : 3;
    sum += value * weight;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return baseNumber + checkDigit;
}

function validateTrackingNumber(trackingNumber) {
  if (trackingNumber.length !== 15) return false;
  if (!/^PK\d{12}\d$/.test(trackingNumber)) return false;
  
  const baseNumber = trackingNumber.substring(0, 14);
  const providedCheckDigit = parseInt(trackingNumber[14]);
  
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    const char = baseNumber[i];
    const value = isNaN(char) ? char.charCodeAt(0) - 55 : parseInt(char);
    const weight = i % 2 === 0 ? 1 : 3;
    sum += value * weight;
  }
  const calculatedCheckDigit = (10 - (sum % 10)) % 10;
  
  return providedCheckDigit === calculatedCheckDigit;
}

module.exports = { generateTrackingNumber, validateTrackingNumber };
