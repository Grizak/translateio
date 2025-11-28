export default function App() {
  if (!window.electronAPI) {
    // ElectronAPI is not available, so were not in electron context
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold underline">TranslateIo</h1>
        <p className="mt-4">
          This application is meant to be run inside the TranslateIo Electron
          app.
        </p>
        <p className="mt-2">
          Please download the desktop application from{" "}
          <a
            className="text-blue-600 underline"
            target="_blank"
            href="https://translateio.app" // FIXME: Use correct url
          >
            https://translateio.app
          </a>
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="p-8">
        <h1 className="text-3xl font-bold underline">TranslateIo</h1>
        <p className="mt-4">Welcome to the TranslateIo Electron App!</p>
      </div>
    </>
  );
}
