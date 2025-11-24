import { useEffect, useRef, useState } from "react";

export default function SceneCanvas() {
  const [booted, setBooted] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const onPointer = async () => {
      if (booted) return;
      const { initScene } = await import("../legacy-main");
      initScene();
      window.__SCENE_INITIALIZED__ = true;
      setBooted(true);
      window.removeEventListener("pointerdown", onPointer);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [booted]);

  return <canvas id="scene-canvas" ref={canvasRef} aria-hidden="true"></canvas>;
}
