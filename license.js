const crypto = require("crypto");
const { ipcMain } = require("electron");
const Store = require("electron-store");
const os = require("os");

const store = new Store();

// Encryption/decryption utilities
const ENCRYPTION_ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = crypto.scryptSync("linkedin-bot-license-key", "salt", 32);

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText) {
  const [iv, encrypted] = encryptedText.split(":");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, Buffer.from(iv, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

// Computer ID generation (based on MAC address + hostname)
function getComputerId() {
  const interfaces = os.networkInterfaces();
  const macAddress = Object.values(interfaces)
    .flat()
    .find((iface) => !iface.internal)?.mac || "unknown";

  const hostname = os.hostname();
  const computerId = `${hostname}:${macAddress}`;
  return crypto.createHash("sha256").update(computerId).digest("hex").substring(0, 16);
}

// License validation and activation
class LicenseManager {
  constructor() {
    this.store = store;
  }

  // Generate a license key (for admin use only)
  // Format: license:timestamp:computerId1:computerId2:signature
  generateLicense() {
    const timestamp = Date.now();
    const computerId1 = "";
    const computerId2 = "";
    const licenseData = `license:${timestamp}:${computerId1}:${computerId2}`;

    // For real implementation, admin would sign this with their private key
    // We'll use HMAC for simplicity (one-way but verifiable)
    const signature = crypto
      .createHmac("sha256", "admin-secret-key-from-env")
      .update(licenseData)
      .digest("hex")
      .substring(0, 12);

    const licenseKey = `${licenseData}:${signature}`;
    return encrypt(licenseKey);
  }

  // Validate a license key structure
  validateLicenseStructure(licenseKey) {
    try {
      const decrypted = decrypt(licenseKey);
      const parts = decrypted.split(":");

      if (parts.length !== 5) {
        return { valid: false, error: "Invalid license format" };
      }

      const [type, timestamp, computer1, computer2, signature] = parts;

      if (type !== "license") {
        return { valid: false, error: "Invalid license type" };
      }

      // Verify signature
      const licenseData = `${type}:${timestamp}:${computer1}:${computer2}`;
      const expectedSignature = crypto
        .createHmac("sha256", "admin-secret-key-from-env")
        .update(licenseData)
        .digest("hex")
        .substring(0, 12);

      if (signature !== expectedSignature) {
        return { valid: false, error: "Invalid license signature" };
      }

      return { valid: true, decrypted };
    } catch (error) {
      return { valid: false, error: "Failed to decrypt license" };
    }
  }

  // Activate license on a computer
  activateLicense(licenseKey) {
    const validation = this.validateLicenseStructure(licenseKey);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const [type, timestamp, computer1, computer2, signature] = validation.decrypted.split(":");
    const currentComputerId = getComputerId();

    // Check if already activated on this computer
    if (computer1 === currentComputerId || computer2 === currentComputerId) {
      return { success: true, status: "already_activated" };
    }

    // Check if both slots are full
    if (computer1 && computer2) {
      return { success: false, error: "License already used on 2 computers. Contact support for more activations." };
    }

    // Assign to available slot
    const newComputer1 = computer1 || currentComputerId;
    const newComputer2 = computer2;
    const updatedLicenseData = `${type}:${timestamp}:${newComputer1}:${newComputer2}`;

    // Create new signature with updated license data
    const newSignature = crypto
      .createHmac("sha256", "admin-secret-key-from-env")
      .update(updatedLicenseData)
      .digest("hex")
      .substring(0, 12);

    const updatedLicenseKey = encrypt(`${updatedLicenseData}:${newSignature}`);

    // Store locally
    this.store.set("license_key", updatedLicenseKey);
    this.store.set("activation_date", new Date().toISOString());

    return { success: true, status: "activated", license: updatedLicenseKey };
  }

  // Get license status
  getLicenseStatus() {
    const licenseKey = this.store.get("license_key");
    const trialStatus = this.getTrialStatus();

    if (!licenseKey) {
      return {
        licensed: false,
        fullAccess: trialStatus.inTrial,
        mode: trialStatus.inTrial ? "trial" : "free",
        trialStatus,
      };
    }

    const validation = this.validateLicenseStructure(licenseKey);
    if (!validation.valid) {
      return {
        licensed: false,
        fullAccess: trialStatus.inTrial,
        mode: trialStatus.inTrial ? "trial" : "free",
        error: "License validation failed",
        trialStatus,
      };
    }

    const [type, timestamp, computer1, computer2] = validation.decrypted.split(":");
    const currentComputerId = getComputerId();

    // Verify this computer is registered
    if (computer1 !== currentComputerId && computer2 !== currentComputerId) {
      return {
        licensed: false,
        fullAccess: trialStatus.inTrial,
        mode: trialStatus.inTrial ? "trial" : "free",
        error: "License not activated on this computer",
        trialStatus,
      };
    }

    return {
      licensed: true,
      fullAccess: true,
      mode: "licensed",
      activationDate: this.store.get("activation_date"),
      computerCount: (computer1 ? 1 : 0) + (computer2 ? 1 : 0),
    };
  }

  // Trial status (7 days free)
  getTrialStatus() {
    const installDate = this.store.get("install_date");

    if (!installDate) {
      this.store.set("install_date", new Date().toISOString());
      return {
        inTrial: true,
        daysRemaining: 7,
        startDate: new Date().toISOString(),
      };
    }

    const daysPassed = Math.floor((Date.now() - new Date(installDate).getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, 7 - daysPassed);

    return {
      inTrial: daysRemaining > 0,
      daysRemaining,
      startDate: installDate,
    };
  }

  isFreeUser() {
    const licenseStatus = this.getLicenseStatus();
    return !licenseStatus.fullAccess;
  }
}

const licenseManager = new LicenseManager();

// IPC Handlers
ipcMain.handle("validate-license-key", async (event, licenseKey) => {
  return licenseManager.validateLicenseStructure(licenseKey);
});

ipcMain.handle("activate-license", async (event, licenseKey) => {
  return licenseManager.activateLicense(licenseKey);
});

ipcMain.handle("get-license-status", async (event) => {
  return licenseManager.getLicenseStatus();
});

ipcMain.handle("get-trial-status", async (event) => {
  return licenseManager.getTrialStatus();
});

ipcMain.handle("is-free-user", async (event) => {
  return licenseManager.isFreeUser();
});

module.exports = {
  licenseManager,
  encrypt,
  decrypt,
  getComputerId,
};
