import { useDropzone } from "react-dropzone";
import '../style/Dropzone.css'

export default function Dropzone({ onDrop }: any) {

    const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({onDrop})

    const files = acceptedFiles.map((file:any) => (
        <li key={file.path}>
          {file.path} - {file.size} bytes
        </li>
    ))

    return (
        <div {...getRootProps({ className: "dropzone" })}>
          <input className="input-zone" {...getInputProps()} />
          <div className="text-center">
            {isDragActive ? (
              <p className="dropzone-content">
                Release to drop the files here
              </p>
            ) : (
              <p className="dropzone-content">
                Drag’n’drop some files here, or click to select files
              </p>
            )}
          </div>
          <aside>
            <ul>{files}</ul>
          </aside>
        </div>
    )
}
