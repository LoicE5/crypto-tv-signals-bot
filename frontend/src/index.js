"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = __importDefault(require("react-dom/client"));
const Main_1 = __importDefault(require("./components/Main"));
require("./style/index.css");
const root = client_1.default.createRoot(document.getElementById('root'));
root.render(<Main_1.default />);
