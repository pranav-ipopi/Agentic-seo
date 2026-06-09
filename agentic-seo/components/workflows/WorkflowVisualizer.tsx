'use client'

import React, { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import TemplateNode, { TemplateNodeType } from './TemplateNode'
import { Skill } from '@/lib/supabase/types'

const nodeTypes = { template: TemplateNode }

type WorkflowVisualizerProps = {
  steps: any[]
  selectedNodeIndex: number | null
  skillOverrides: Record<string, string>
  skills: Skill[]
  onNodeSelect: (index: number | null) => void
}

export default function WorkflowVisualizer({
  steps,
  selectedNodeIndex,
  skillOverrides,
  skills,
  onNodeSelect,
}: WorkflowVisualizerProps) {

  const nodes: TemplateNodeType[] = useMemo(() => {
    return steps.map((step, index) => {
      const overrideId = skillOverrides[String(index)]
      const skill = overrideId
        ? skills.find(s => s.skill_id === overrideId)
        : undefined

      return {
        id: `step-${index}`,
        type: 'template' as const,
        position: { x: 250, y: 50 + index * 160 },
        draggable: false,
        selectable: false,
        data: {
          name: step.name,
          type: step.type,
          skill: step.skill,
          index,
          isSelected: index === selectedNodeIndex,
          assignedSkillName: skill?.name ?? undefined,
        },
      }
    })
  }, [steps, selectedNodeIndex, skillOverrides, skills])

  const edges: Edge[] = useMemo(() => {
    return steps.slice(0, -1).map((_, i) => ({
      id: `e-${i}-${i + 1}`,
      source: `step-${i}`,
      target: `step-${i + 1}`,
      animated: true,
      style: { stroke: '#475569', strokeWidth: 2 },
    }))
  }, [steps])

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const index = (node.data as any).index as number
      const isExecutable =
        node.data.type === 'hermes_task' || node.data.type === 'browser_use_task'
      if (!isExecutable) return
      // Toggle: clicking the same node deselects it
      onNodeSelect(index === selectedNodeIndex ? null : index)
    },
    [selectedNodeIndex, onNodeSelect]
  )

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        className="bg-gray-50 dark:bg-gray-950"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
      >
        <Background color="#1e293b" variant={BackgroundVariant.Dots} gap={24} size={1.5} />
        <Controls
          showInteractive={false}
          className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 fill-gray-400 [&>button]:border-gray-200 dark:border-gray-800 [&>button:hover]:bg-gray-100 dark:bg-gray-800 [&>button]:bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
        />
      </ReactFlow>
    </div>
  )
}
