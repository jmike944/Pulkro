const { open, snap, settle, done } = require("./shoot.cjs");
(async () => {
  {
    const { page, close } = await open({ role: "direccion", device: "desktop" });
    await snap(page, "00-portada-escritorio");
    await close();
  }
  {
    const { page, close } = await open({ role: "supervisor", device: "phone" });
    await snap(page, "00-portada-telefono");
    await close();
  }
  await done();
})();
