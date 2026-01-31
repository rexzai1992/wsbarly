import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Handle,
    Position,
    BackgroundVariant,
    Panel,
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
    MessageSquare,
    Image as ImageIcon,
    HelpCircle,
    Webhook,
    Settings,
    Play,
    Square,
    Activity,
    Plus,
    Trash2,
    Save,
    X
} from 'lucide-react';

const nodeTypes = {
    START: (props: any) => (
        <div className="bg-[#202c33] border-l-4 border-emerald-500 p-4 rounded-lg shadow-xl w-48 text-white">
            <div className="flex items-center gap-2 mb-2">
                <Play className="w-4 h-4 text-emerald-500" />
                <span className="font-bold text-xs uppercase tracking-wider">Start</span>
            </div>
            <p className="text-[10px] text-gray-400">Entrance point of the flow</p>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-emerald-500 border-2 border-[#111b21]" />
        </div>
    ),
    MESSAGE: (props: any) => (
        <div className="bg-[#2a3942] border border-[#313d45] p-4 rounded-lg shadow-xl w-56 text-[#e9edef] group">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-500 border-2 border-[#111b21]" />
            <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-xs uppercase tracking-wider">Message</span>
                <button onClick={() => props.data.onDelete(props.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-rose-500 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            <textarea
                className="w-full bg-[#111b21] border border-[#313d45] rounded p-2 text-[11px] h-16 resize-none focus:outline-none focus:border-blue-400"
                value={props.data.content}
                onChange={(e) => props.data.onChange(props.id, { content: e.target.value })}
                placeholder="Type message..."
            />
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-400 border-2 border-[#111b21]" />
        </div>
    ),
    QUESTION: (props: any) => (
        <div className="bg-[#2a3942] border border-purple-500/30 p-4 rounded-lg shadow-xl w-60 text-[#e9edef] group">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-500 border-2 border-[#111b21]" />
            <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-xs uppercase tracking-wider">Question</span>
                <button onClick={() => props.data.onDelete(props.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-rose-500 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            <textarea
                className="w-full bg-[#111b21] border border-[#313d45] rounded p-2 text-[11px] h-12 mb-2 resize-none focus:outline-none focus:border-purple-400"
                value={props.data.content}
                onChange={(e) => props.data.onChange(props.id, { content: e.target.value })}
                placeholder="Type question..."
            />
            <div className="space-y-1">
                <p className="text-[9px] text-gray-500 uppercase font-bold px-1">Options (links automatically)</p>
                <div className="flex flex-col gap-1">
                    {(props.data.options || []).map((opt: string, i: number) => (
                        <div key={i} className="flex items-center gap-1 group/opt relative">
                            <input
                                className="bg-[#111b21] border border-[#313d45] rounded px-2 py-1 text-[10px] flex-1 focus:border-purple-400 focus:outline-none"
                                value={opt}
                                onChange={(e) => {
                                    const newOpts = [...props.data.options];
                                    newOpts[i] = e.target.value;
                                    props.data.onChange(props.id, { options: newOpts });
                                }}
                            />
                            <button
                                onClick={() => {
                                    const newOpts = props.data.options.filter((_: any, idx: number) => idx !== i);
                                    props.data.onChange(props.id, { options: newOpts });
                                }}
                                className="opacity-0 group-hover/opt:opacity-100 text-rose-500 hover:text-rose-400 p-0.5 transition-opacity"
                            >
                                <X className="w-3 h-3" />
                            </button>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`opt-${i}`}
                                className="w-2 h-4 bg-purple-400 rounded-sm border-none translate-x-1"
                            />
                        </div>
                    ))}
                    <button
                        onClick={() => props.data.onChange(props.id, { options: [...(props.data.options || []), 'New option'] })}
                        className="text-[9px] text-purple-400 flex items-center justify-center p-1 border border-dashed border-purple-500/30 rounded mt-1 bg-[#1a2329] hover:bg-[#202c33] transition-colors"
                    >
                        <Plus className="w-3 h-3 mr-1" /> Add Option
                    </button>
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} id="default" className="w-3 h-3 bg-purple-400 border-2 border-[#111b21]" />
        </div>
    ),
    IMAGE: (props: any) => (
        <div className="bg-[#2a3942] border border-orange-500/30 p-4 rounded-lg shadow-xl w-56 text-[#e9edef] group">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-500 border-2 border-[#111b21]" />
            <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="w-4 h-4 text-orange-400" />
                <span className="font-bold text-xs uppercase tracking-wider">Image</span>
                <button onClick={() => props.data.onDelete(props.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-rose-500 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            <input
                className="w-full bg-[#111b21] border border-[#313d45] rounded p-2 text-[10px] mb-2 focus:outline-none focus:border-orange-400"
                value={props.data.imageUrl}
                onChange={(e) => props.data.onChange(props.id, { imageUrl: e.target.value })}
                placeholder="Image URL..."
            />
            <input
                className="w-full bg-[#111b21] border border-[#313d45] rounded p-2 text-[10px] focus:outline-none focus:border-orange-400"
                value={props.data.caption}
                onChange={(e) => props.data.onChange(props.id, { caption: e.target.value })}
                placeholder="Caption..."
            />
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-orange-400 border-2 border-[#111b21]" />
        </div>
    ),
    CONDITION: (props: any) => (
        <div className="bg-[#2a3942] border border-yellow-500/30 p-4 rounded-lg shadow-xl w-56 text-[#e9edef] group">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-500 border-2 border-[#111b21]" />
            <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-yellow-400" />
                <span className="font-bold text-xs uppercase tracking-wider">Condition</span>
                <button onClick={() => props.data.onDelete(props.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-rose-500 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">Decide path based on conditions</p>
            <div className="flex justify-between items-center px-2 py-1 bg-[#111b21] rounded">
                <span className="text-[10px] text-green-400 font-bold uppercase">True</span>
                <Handle type="source" position={Position.Right} id="true" className="w-3 h-5 bg-green-500 rounded-sm border-none -mr-4" />
            </div>
            <div className="flex justify-between items-center px-2 py-1 bg-[#111b21] rounded mt-2">
                <span className="text-[10px] text-rose-400 font-bold uppercase">False</span>
                <Handle type="source" position={Position.Left} id="false" className="w-3 h-5 bg-rose-500 rounded-sm border-none -ml-4" />
            </div>
        </div>
    ),
    END: (props: any) => (
        <div className="bg-[#202c33] border-l-4 border-rose-500 p-4 rounded-lg shadow-xl w-48 text-white group">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-500 border-2 border-[#111b21]" />
            <div className="flex items-center gap-2 mb-2">
                <Square className="w-4 h-4 text-rose-500" />
                <span className="font-bold text-xs uppercase tracking-wider">End Flow</span>
                <button onClick={() => props.data.onDelete(props.id)} className="ml-auto opacity-0 group-hover:opacity-100 text-rose-500 transition-opacity">
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            <textarea
                className="w-full bg-[#111b21] border border-[#313d45] rounded p-2 text-[11px] h-12 resize-none focus:outline-none focus:border-rose-400"
                value={props.data.content}
                onChange={(e) => props.data.onChange(props.id, { content: e.target.value })}
                placeholder="Goodbye message (optional)..."
            />
        </div>
    ),
};

export default function FlowCanvas({ flow, onSave }: { flow: any, onSave: (flow: any) => void }) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    // Initialize nodes and edges from flow data
    useEffect(() => {
        if (!flow || !flow.nodes) return;

        const initialNodes: Node[] = flow.nodes.map((n: any, i: number) => ({
            id: n.id,
            type: n.type,
            position: n.position || { x: i * 300, y: 100 },
            data: {
                ...n,
                onChange: handleNodeDataChange,
                onDelete: handleNodeDelete
            },
        }));

        const initialEdges: Edge[] = [];
        flow.nodes.forEach((n: any) => {
            if (n.nextId) {
                initialEdges.push({
                    id: `e-${n.id}-${n.nextId}`,
                    source: n.id,
                    target: n.nextId,
                    className: 'stroke-[#00a884] stroke-2',
                    animated: true,
                });
            }
            if (n.connections) {
                Object.entries(n.connections).forEach(([key, targetId]) => {
                    if (targetId) {
                        initialEdges.push({
                            id: `e-${n.id}-${key}-${targetId}`,
                            source: n.id,
                            target: targetId as string,
                            sourceHandle: key === 'default' ? 'default' : key,
                            className: 'stroke-[#00a884] stroke-2',
                            style: { strokeDasharray: '5,5' },
                            label: key !== 'default' ? key : '',
                            labelStyle: { fill: '#8696a0', fontSize: 10, background: '#111b21', padding: 2 },
                            animated: true,
                        });
                    }
                });
            }
        });

        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [flow.id]);

    const handleNodeDataChange = useCallback((id: string, newData: any) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return { ...node, data: { ...node.data, ...newData } };
                }
                return node;
            })
        );
    }, []);

    const handleNodeDelete = useCallback((id: string) => {
        setNodes((nds) => nds.filter((node) => node.id !== id));
        setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    }, []);

    const onConnect = useCallback((params: Connection) => {
        setEdges((eds) => addEdge({
            ...params,
            animated: true,
            className: 'stroke-[#00a884] stroke-2'
        }, eds));
    }, []);

    const handleSave = () => {
        const updatedNodes = nodes.map((n) => {
            const nodeData = { ...n.data };
            delete nodeData.onChange;
            delete nodeData.onDelete;

            // Convert edges back to nextId/connections
            const sourceEdges = edges.filter(e => e.source === n.id);

            if (n.type === 'QUESTION') {
                const connections: any = {};
                sourceEdges.forEach(e => {
                    if (e.sourceHandle) {
                        if (e.sourceHandle.startsWith('opt-')) {
                            const optIndex = parseInt(e.sourceHandle.replace('opt-', ''));
                            const optLabel = (nodeData as any).options[optIndex];
                            if (optLabel) connections[optLabel] = e.target;
                        } else {
                            connections[e.sourceHandle] = e.target;
                        }
                    }
                });
                return { ...nodeData, type: n.type, position: n.position, connections };
            } else if (n.type === 'CONDITION') {
                const connections: any = {};
                sourceEdges.forEach(e => {
                    if (e.sourceHandle) connections[e.sourceHandle] = e.target;
                });
                return { ...nodeData, type: n.type, position: n.position, connections };
            } else {
                const nextEdge = sourceEdges.find(e => !e.sourceHandle);
                return { ...nodeData, type: n.type, position: n.position, nextId: nextEdge?.target || '' };
            }
        });

        onSave({ ...flow, nodes: updatedNodes });
    };

    const addNode = (type: string) => {
        const id = `node-${Date.now()}`;
        const newNode: Node = {
            id,
            type,
            position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
            data: {
                id,
                type,
                content: '',
                onChange: handleNodeDataChange,
                onDelete: handleNodeDelete,
                options: type === 'QUESTION' ? ['View Menu', 'Support'] : [],
            },
        };
        setNodes((nds) => nds.concat(newNode));
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a]">
            <div className="h-12 bg-[#202c33] border-b border-[#313d45] flex items-center justify-between px-6 z-20">
                <div className="flex items-center gap-4">
                    <span className="text-[#00a884] text-xs font-bold uppercase tracking-tighter">Tools</span>
                    <div className="h-4 w-px bg-[#313d45]" />
                    <button onClick={() => addNode('MESSAGE')} className="px-3 py-1 bg-[#2a3942] hover:bg-[#374045] text-[#e9edef] text-[11px] rounded transition-colors flex items-center gap-2">
                        <MessageSquare className="w-3 h-3 text-blue-400" /> Message
                    </button>
                    <button onClick={() => addNode('QUESTION')} className="px-3 py-1 bg-[#2a3942] hover:bg-[#374045] text-[#e9edef] text-[11px] rounded transition-colors flex items-center gap-2">
                        <HelpCircle className="w-3 h-3 text-purple-400" /> Question
                    </button>
                    <button onClick={() => addNode('CONDITION')} className="px-3 py-1 bg-[#2a3942] hover:bg-[#374045] text-[#e9edef] text-[11px] rounded transition-colors flex items-center gap-2">
                        <Activity className="w-3 h-3 text-yellow-400" /> Logic
                    </button>
                    <button onClick={() => addNode('IMAGE')} className="px-3 py-1 bg-[#2a3942] hover:bg-[#374045] text-[#e9edef] text-[11px] rounded transition-colors flex items-center gap-2">
                        <ImageIcon className="w-3 h-3 text-orange-400" /> Image
                    </button>
                    <button onClick={() => addNode('END')} className="px-3 py-1 bg-[#2a3942] hover:bg-[#374045] text-[#e9edef] text-[11px] rounded transition-colors flex items-center gap-2">
                        <Square className="w-3 h-3 text-rose-500" /> End
                    </button>
                </div>
                <button
                    onClick={handleSave}
                    className="bg-[#00a884] hover:bg-[#008f6f] text-[#111b21] px-4 py-1 rounded text-xs font-bold flex items-center gap-2 transition-colors uppercase"
                >
                    <Save className="w-4 h-4" /> Save Canvas
                </button>
            </div>

            <div className="flex-1 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    style={{ background: '#0b141a' }}
                    colorMode="dark"
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#313d45" />
                    <Controls className="bg-[#202c33] border-[#313d45] fill-white" />
                    <MiniMap
                        nodeColor={(n) => {
                            if (n.type === 'START') return '#10b981';
                            if (n.type === 'END') return '#ef4444';
                            if (n.type === 'QUESTION') return '#a855f7';
                            return '#3b82f6';
                        }}
                        maskColor="rgba(11, 20, 26, 0.7)"
                        className="bg-[#202c33] border-[#313d45]"
                    />
                </ReactFlow>
            </div>
        </div>
    );
}
