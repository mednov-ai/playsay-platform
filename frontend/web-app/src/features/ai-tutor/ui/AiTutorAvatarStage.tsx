import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, RoundedBox } from "@react-three/drei";
import { useRef } from "react";
import type { Group, Mesh } from "three";

function Character({ speaking }: { speaking: boolean }) {
  const group = useRef<Group>(null);
  const mouth = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = Math.sin(clock.elapsedTime * 0.45) * 0.08;
    if (mouth.current) mouth.current.scale.y = speaking ? 0.55 + Math.abs(Math.sin(clock.elapsedTime * 11)) * 1.2 : 0.35;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.18}>
      <group ref={group} position={[0, -0.55, 0]}>
        <RoundedBox args={[1.45, 1.6, 0.62]} radius={0.28} smoothness={5} position={[0, -1.25, 0]}>
          <meshStandardMaterial color="#ff6b1a" roughness={0.68} />
        </RoundedBox>
        <mesh position={[0, 0.28, 0]}>
          <sphereGeometry args={[0.92, 48, 48]} />
          <meshStandardMaterial color="#f5c5a8" roughness={0.72} />
        </mesh>
        <mesh position={[-0.31, 0.42, 0.82]}><sphereGeometry args={[0.095, 24, 24]} /><meshStandardMaterial color="#171717" /></mesh>
        <mesh position={[0.31, 0.42, 0.82]}><sphereGeometry args={[0.095, 24, 24]} /><meshStandardMaterial color="#171717" /></mesh>
        <mesh ref={mouth} position={[0, 0.02, 0.86]} scale={[1, 0.35, 1]}>
          <sphereGeometry args={[0.16, 24, 24]} />
          <meshStandardMaterial color="#8c2f25" />
        </mesh>
        <mesh position={[0, 0.85, 0]} rotation={[0.05, 0, 0]}>
          <sphereGeometry args={[0.94, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
          <meshStandardMaterial color="#3b241b" roughness={0.8} />
        </mesh>
      </group>
    </Float>
  );
}

export function AiTutorAvatarStage({ speaking }: { speaking: boolean }) {
  return (
    <div className="h-full min-h-72 w-full" aria-hidden="true">
      <Canvas camera={{ position: [0, 0.1, 5.2], fov: 34 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <color attach="background" args={["#fff5e9"]} />
        <ambientLight intensity={1.8} />
        <directionalLight position={[3, 5, 5]} intensity={2.4} color="#fff1d6" />
        <Character speaking={speaking} />
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
