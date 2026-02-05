"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    VANTA: any;
    THREE: any;
  }
}

export default function VantaBackground() {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<any>(null);

  useEffect(() => {
    console.log("VantaBackground mounted");

    // Load Three.js
    const threeScript = document.createElement("script");
    threeScript.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js";
    threeScript.async = true;

    // Load Vanta Waves
    const vantaScript = document.createElement("script");
    vantaScript.src = "https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.waves.min.js";
    vantaScript.async = true;

    threeScript.onload = () => {
      console.log("Three.js loaded");
      document.head.appendChild(vantaScript);
    };

    vantaScript.onload = () => {
      console.log("Vanta loaded");
      if (vantaRef.current && !vantaEffect.current) {
        try {
          vantaEffect.current = window.VANTA.WAVES({
            el: vantaRef.current,
            THREE: window.THREE,
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.0,
            minWidth: 200.0,
            scale: 1.0,
            scaleMobile: 1.0,
            color: 0x1a2332,
            shininess: 40.0,
            waveHeight: 20.0,
            waveSpeed: 1.0,
            zoom: 0.75,
          });
          console.log("Vanta effect created:", vantaEffect.current);
        } catch (err) {
          console.error("Error creating Vanta effect:", err);
        }
      }
    };

    document.head.appendChild(threeScript);

    return () => {
      if (vantaEffect.current) {
        console.log("Destroying Vanta effect");
        vantaEffect.current.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={vantaRef}
      className="fixed inset-0 -z-10"
      style={{
        width: "100%",
        height: "100vh",
        backgroundColor: "#0F1115"
      }}
    />
  );
}
