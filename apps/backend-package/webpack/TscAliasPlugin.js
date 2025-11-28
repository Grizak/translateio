const { exec } = await import("child_process");

export default class TscAliasPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync("TscAliasPlugin", (_, callback) => {
      exec("tsc-alias", (err) => {
        if (err) console.error(err);
        callback();
      });
    });
  }
}
