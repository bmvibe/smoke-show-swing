"use client";

import { useEffect, useRef, useState } from "react";

export default function VantaBackground() {
  const vantaRef = useRef<HTMLDivElement>(null);
  const [vantaEffect, setVantaEffect] = useState<any>(null);

  useEffect(() => {
    console.log("VantaBackground mounted, vantaRef:", vantaRef.current);

    if (!vantaEffect && vantaRef.current) {
      console.log("Starting Vanta initialization...");

      // Dynamically import Vanta and Three.js to avoid SSR issues
      import("vanta/dist/vanta.waves.min")
        .then((WAVES) => {
          console.log("Vanta WAVES loaded:", WAVES);
          return import("three").then((THREE) => {
            console.log("Three.js loaded:", THREE);

            const effect = (WAVES as any).default({
              el: vantaRef.current,
              THREE: THREE,
              mouseControls: true,
              touchControls: true,
              gyroControls: false,
              minHeight: 200.0,
              minWidth: 200.0,
              scale: 1.0,
              scaleMobile: 1.0,
              color: 0x1a2332, // Lighter blue-gray for better visibility
              shininess: 40.0,
              waveHeight: 20.0,
              waveSpeed: 1.0,
              zoom: 0.75,
            });

            console.log("Vanta effect created:", effect);
            setVantaEffect(effect);
          });
        })
        .catch((err) => {
          console.error("Failed to load Vanta:", err);
        });
    }

    return () => {
      if (vantaEffect) {
        console.log("Destroying Vanta effect");
        vantaEffect.destroy();
      }
    };
  }, [vantaEffect]);

  return (
    <div
      ref={vantaRef}
      className="fixed inset-0 -z-10"
      style={{
        width: "100%",
        height: "100vh",
        backgroundColor: "#0F1115" // Fallback background
      }}
    />
  );
}
