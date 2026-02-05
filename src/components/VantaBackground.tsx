"use client";

import { useEffect, useRef, useState } from "react";

export default function VantaBackground() {
  const vantaRef = useRef<HTMLDivElement>(null);
  const [vantaEffect, setVantaEffect] = useState<any>(null);

  useEffect(() => {
    if (!vantaEffect && vantaRef.current) {
      // Dynamically import Vanta and Three.js to avoid SSR issues
      import("vanta/dist/vanta.waves.min")
        .then((WAVES) => {
          return import("three").then((THREE) => {
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
            setVantaEffect(effect);
          });
        })
        .catch((err) => {
          console.error("Failed to load Vanta:", err);
        });
    }

    return () => {
      if (vantaEffect) {
        vantaEffect.destroy();
      }
    };
  }, [vantaEffect]);

  return (
    <div
      ref={vantaRef}
      className="fixed inset-0 -z-10"
      style={{ width: "100%", height: "100vh" }}
    />
  );
}
