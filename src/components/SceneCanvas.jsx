import { useEffect, useRef } from "react";
import { initScene, destroyScene } from "../legacy-main";

export default function SceneCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    initScene();
    const handleBeforeUnload = () => destroyScene();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      destroyScene();
    };
  }, []);

  return <canvas id="scene-canvas" ref={canvasRef} aria-hidden="true"></canvas>;
}
