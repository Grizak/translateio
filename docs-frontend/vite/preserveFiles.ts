import type { Plugin } from "vite";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";

interface PreserveFilesOptions {
  files: string[];
  outputDir?: string;
}

export default function preserveFilesPlugin(
  options: PreserveFilesOptions
): Plugin {
  const { files: filesToPreserve, outputDir } = options;
  const tempDir = ".vite-temp";
  const copiedFiles = new Map<string, string>();
  let resolvedOutDir: string;

  return {
    name: "preserve-files",

    configResolved(config) {
      // Get the actual output directory from Vite config
      resolvedOutDir = outputDir || config.build.outDir;
    },

    buildStart() {
      // Copy files before build cleans output directory
      filesToPreserve.forEach((file) => {
        const sourcePath = join(resolvedOutDir, file);
        const tempPath = join(tempDir, file);

        if (existsSync(sourcePath)) {
          mkdirSync(dirname(tempPath), { recursive: true });
          copyFileSync(sourcePath, tempPath);
          copiedFiles.set(file, tempPath);
          console.log(`Preserved: ${file}`);
        }
      });
    },

    closeBundle() {
      // Restore files after build completes
      copiedFiles.forEach((tempPath, file) => {
        const destPath = join(resolvedOutDir, file);
        mkdirSync(dirname(destPath), { recursive: true });
        copyFileSync(tempPath, destPath);
        console.log(`Restored: ${file}`);
      });

      copiedFiles.clear();

      // After all files are copied, remove the temp dir
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
