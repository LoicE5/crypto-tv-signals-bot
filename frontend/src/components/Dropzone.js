"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_dropzone_1 = require("react-dropzone");
require("../style/Dropzone.css");
function Dropzone({ onDrop }) {
    const { getRootProps, getInputProps, isDragActive, acceptedFiles } = (0, react_dropzone_1.useDropzone)({ onDrop });
    const files = acceptedFiles.map((file) => (<li key={file.path}>
          {file.path} - {file.size} bytes
        </li>));
    return (<div {...getRootProps({ className: "dropzone" })}>
          <input className="input-zone" {...getInputProps()}/>
          <div className="text-center">
            {isDragActive ? (<p className="dropzone-content">
                Release to drop the files here
              </p>) : (<p className="dropzone-content">
                Drag’n’drop some files here, or click to select files
              </p>)}
          </div>
          <aside>
            <ul>{files}</ul>
          </aside>
        </div>);
}
exports.default = Dropzone;
