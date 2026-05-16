import * as THREE from "three"
import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"

function Cog({
  teeth = 120,
  innerRadius = 1,
  outerRadius = 1.2,
  toothRatio = 0.001, // fraction of each tooth cycle that is "outer"
  segmentsPerTooth = 12,
  speed = 0.8,
}) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    ref.current!.rotation.y += delta * speed
  })

  const geometry = useMemo(() => {
    const shape = new THREE.Shape()

    const totalSegments = teeth * segmentsPerTooth

    for (let i = 0; i <= totalSegments; i++) {
      const t = i / totalSegments
      const angle = t * Math.PI * 2

      const toothPhase = (t * teeth) % 1;

      const isTooth = toothPhase < toothRatio

      const r = isTooth ? outerRadius : innerRadius

      const x = Math.cos(angle) * r
      const y = Math.sin(angle) * r

      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }

    shape.closePath()

    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.3,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.02,
    })
  }, [teeth, innerRadius, outerRadius, toothRatio, segmentsPerTooth])

  return (
    <mesh ref={ref} geometry={geometry}>
      <meshStandardMaterial color="orange" />
    </mesh>
  )
}

export default function App() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }} style={{ width: '100%', height: '800px' }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 3, 3]} intensity={1} />

      <Cog teeth={18} toothRatio={0.3} />
    </Canvas>
  )
}