import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const babel = require("@babel/core");

const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, ".test-dist");

// Clean and prepare dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 1. Create Mock Libraries in .test-dist
const mockReactNativeContent = `
const React = require("react");

function createMock(displayName) {
  const Comp = React.forwardRef((props, ref) => React.createElement(displayName, { ...props, ref }));
  Comp.displayName = displayName;
  return Comp;
}

module.exports = {
  Platform: { OS: "ios", select: (objs) => objs.ios || objs.default },
  StyleSheet: { create: (s) => s },
  View: createMock("View"),
  Text: createMock("Text"),
  Pressable: createMock("Pressable"),
  TextInput: createMock("TextInput"),
  ActivityIndicator: createMock("ActivityIndicator"),
  ScrollView: createMock("ScrollView"),
  Switch: createMock("Switch"),
  KeyboardAvoidingView: createMock("KeyboardAvoidingView"),
};
`;
fs.writeFileSync(path.join(distDir, "mock-react-native.js"), mockReactNativeContent);

const mockStorageContent = `
const store = new Map();

const mockAsyncStorage = {
  setItem: async (k, v) => store.set(k, String(v)),
  getItem: async (k) => store.has(k) ? store.get(k) : null,
  removeItem: async (k) => store.delete(k),
  multiSet: async (pairs) => pairs.forEach(([k, v]) => store.set(k, String(v))),
  multiGet: async (keys) => keys.map((k) => [k, store.has(k) ? store.get(k) : null]),
  multiRemove: async (keys) => keys.forEach((k) => store.delete(k)),
  clear: async () => store.clear(),
};

const mockSecureStore = {
  isAvailableAsync: async () => true,
  setItemAsync: async (k, v) => store.set("sec_" + k, String(v)),
  getItemAsync: async (k) => store.has("sec_" + k) ? store.get("sec_" + k) : null,
  deleteItemAsync: async (k) => store.delete("sec_" + k),
};

module.exports = { mockAsyncStorage, mockSecureStore };
`;
fs.writeFileSync(path.join(distDir, "mock-storage.js"), mockStorageContent);

// 2. Transpile all JS files from src/ and __tests__/
function transpileDirectory(srcFolder, destFolder) {
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }

  const items = fs.readdirSync(srcFolder);
  for (const item of items) {
    const srcPath = path.join(srcFolder, item);
    const destPath = path.join(destFolder, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      transpileDirectory(srcPath, destPath);
    } else if (item.endsWith(".js")) {
      let code = fs.readFileSync(srcPath, "utf8");

      // Replace native library imports with local mocks
      code = code
        .replace(/from "react-native"/g, `from "${path.join(distDir, "mock-react-native.js").replace(/\\/g, "/")}"`)
        .replace(/from '@react-native-async-storage\/async-storage'/g, `from "${path.join(distDir, "mock-storage.js").replace(/\\/g, "/")}"`)
        .replace(/from "@react-native-async-storage\/async-storage"/g, `from "${path.join(distDir, "mock-storage.js").replace(/\\/g, "/")}"`)
        .replace(/from "expo-secure-store"/g, `from "${path.join(distDir, "mock-storage.js").replace(/\\/g, "/")}"`)
        .replace(/from "@react-native-community\/netinfo"/g, `from "${path.join(distDir, "mock-react-native.js").replace(/\\/g, "/")}"`);

      // If mock-storage was imported, map default import
      if (code.includes("mock-storage")) {
        code = code
          .replace(/import AsyncStorage from/g, "import { mockAsyncStorage as AsyncStorage } from")
          .replace(/import \* as SecureStore from/g, "import { mockSecureStore as SecureStore } from");
      }

      const transformed = babel.transformSync(code, {
        filename: srcPath,
        plugins: [
          "@babel/plugin-transform-react-jsx",
          "@babel/plugin-transform-modules-commonjs",
        ],
      });

      fs.writeFileSync(destPath, transformed.code, "utf8");
    }
  }
}

transpileDirectory(path.join(rootDir, "src"), path.join(distDir, "src"));
transpileDirectory(path.join(rootDir, "__tests__"), path.join(distDir, "__tests__"));

// 3. Run node --test on the transpiled test files
console.log("Transpilation complete. Executing test suites with node:test...");

const testFiles = [];
function collectTestFiles(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) collectTestFiles(full);
    else if (item.endsWith(".test.js")) testFiles.push(full);
  }
}
collectTestFiles(path.join(distDir, "__tests__"));

const result = spawnSync("node", ["--test", ...testFiles], {
  cwd: rootDir,
  stdio: "inherit",
});

process.exit(result.status ?? 0);
