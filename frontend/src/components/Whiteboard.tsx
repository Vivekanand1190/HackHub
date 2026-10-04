import React, { useRef, useState, useEffect } from 'react';
import { 
  Square, 
  Circle, 
  Minus, 
  ArrowRight, 
  Triangle, 
  Brush, 
  Highlighter, 
  Eraser, 
  StickyNote, 
  Trash2, 
  Sparkles,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Download,
  Hand,
  Grid
} from 'lucide-react';
import { Socket } from 'socket.io-client';

interface WhiteboardProps {
  socket: Socket | null;
  teamId: string;
  initialData?: DrawAction[];
}

export interface DrawAction {
  id: string;
  type: 'draw' | 'rect' | 'circle' | 'line' | 'arrow' | 'triangle' | 'sticky' | 'sticky-move' | 'sticky-edit' | 'sticky-delete' | 'laser';
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  color: string;
  width: number;
  style?: 'solid' | 'dashed' | 'dotted';
  penStyle?: 'brush' | 'highlighter' | 'calligraphy' | 'eraser';
  text?: string;
  path?: { x: number; y: number }[];
  fill?: 'none' | 'semi' | 'solid';
}

function hexToRGBA(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r || 0}, ${g || 0}, ${b || 0}, ${alpha})`;
}

export default function Whiteboard({ socket, teamId, initialData = [] }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Drawing configurations
  const [tool, setTool] = useState<'brush' | 'highlighter' | 'calligraphy' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'triangle' | 'sticky' | 'pan' | 'laser'>('brush');
  const [color, setColor] = useState('#ffe500');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [strokeStyle, setStrokeStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [fillMode, setFillMode] = useState<'none' | 'semi' | 'solid'>('none');
  
  // Drawing states
  const [isDrawing, setIsDrawing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [history, setHistory] = useState<DrawAction[]>([]);
  
  // Sticky notes drag state
  const [draggedStickyId, setDraggedStickyId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Pan, zoom, snapping, and laser pointer states
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [activeLasers, setActiveLasers] = useState<Record<string, { path: { x: number; y: number }[]; color: string; timestamp: number }>>({});
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { socketId: string; userId: string; name: string; color: string; x: number; y: number }>>({});
  const lastEmitRef = useRef<number>(0);

  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  // Load initial history data
  useEffect(() => {
    if (initialData && initialData.length > 0) {
      setHistory(initialData);
    }
  }, [initialData]);

  // Set up canvas dimensions & context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 550 * 2;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `550px`;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.scale(2, 2);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;

    redrawAll(context);
  }, []);

  // Redraw canvas whenever history, pan, zoom, or activeLasers changes
  useEffect(() => {
    const ctx = contextRef.current;
    if (ctx) {
      redrawAll(ctx);
    }
  }, [history, panX, panY, zoom, activeLasers]);

  // Space key keyboard listeners for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Redraw loop for fading laser trails
  useEffect(() => {
    const hasActiveLasers = Object.values(activeLasers).some(l => Date.now() - l.timestamp < 1500);
    if (!hasActiveLasers) return;
    
    const interval = setInterval(() => {
      const ctx = contextRef.current;
      if (ctx) {
        redrawAll(ctx);
      }
    }, 40); // ~25 fps
    
    return () => clearInterval(interval);
  }, [activeLasers]);

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleDrawAction = (action: DrawAction) => {
      if (action.type === 'laser') {
        setActiveLasers(prev => ({
          ...prev,
          [action.text || 'Teammate']: {
            path: action.path || [],
            color: action.color,
            timestamp: Date.now()
          }
        }));
        return;
      }

      setHistory(prev => {
        let updated = [...prev];
        if (action.type === 'sticky-move') {
          updated = updated.map(item => item.id === action.id ? { ...item, x: action.x, y: action.y } : item);
        } else if (action.type === 'sticky-edit') {
          updated = updated.map(item => item.id === action.id ? { ...item, text: action.text || '', color: action.color } : item);
        } else if (action.type === 'sticky-delete') {
          updated = updated.filter(item => item.id !== action.id);
        } else {
          // Normal action, check if it already exists to prevent duplication
          if (!updated.some(item => item.id === action.id)) {
            updated.push(action);
          }
        }
        return updated;
      });
    };

    const handleClear = () => {
      setHistory([]);
    };

    const handleCursorMove = (data: { socketId: string; userId: string; name: string; color: string; target: string; x: number; y: number }) => {
      if (data.target === 'whiteboard') {
        setRemoteCursors(prev => ({
          ...prev,
          [data.socketId]: {
            socketId: data.socketId,
            userId: data.userId,
            name: data.name,
            color: data.color || '#ffe500',
            x: data.x,
            y: data.y
          }
        }));
      }
    };

    const handleCursorRemove = (data: { socketId: string }) => {
      setRemoteCursors(prev => {
        const next = { ...prev };
        delete next[data.socketId];
        return next;
      });
    };

    const handleMembersUpdate = (members: any[]) => {
      const activeSocketIds = new Set((members || []).map(m => m.socketId));
      setRemoteCursors(prev => {
        const next: Record<string, any> = {};
        Object.entries(prev).forEach(([key, cur]) => {
          if (activeSocketIds.has(key)) next[key] = cur;
        });
        return next;
      });
    };

    socket.on('draw-action', handleDrawAction);
    socket.on('draw-clear', handleClear);
    socket.on('cursor-move', handleCursorMove);
    socket.on('cursor-remove', handleCursorRemove);
    socket.on('members-update', handleMembersUpdate);

    return () => {
      socket.off('draw-action', handleDrawAction);
      socket.off('draw-clear', handleClear);
      socket.off('cursor-move', handleCursorMove);
      socket.off('cursor-remove', handleCursorRemove);
      socket.off('members-update', handleMembersUpdate);
    };
  }, [socket]);

  // Redraw grid helper covering visible world coordinates
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    const gridSize = 25;
    
    // Calculate world viewport boundaries
    const startX = Math.floor(-panX / (gridSize * zoom)) * gridSize - gridSize * 2;
    const startY = Math.floor(-panY / (gridSize * zoom)) * gridSize - gridSize * 2;
    const endX = startX + (width / zoom) + gridSize * 4;
    const endY = startY + (height / zoom) + gridSize * 4;
    
    for (let x = startX; x < endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
  };

  // Render a specific drawing action on the context
  const renderAction = (ctx: CanvasRenderingContext2D, action: DrawAction) => {
    ctx.save();
    
    // Set standard drawing configs
    ctx.strokeStyle = action.color;
    ctx.lineWidth = action.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Stroke Dashing
    if (action.style === 'dashed') {
      ctx.setLineDash([10, 5]);
    } else if (action.style === 'dotted') {
      ctx.setLineDash([2, 5]);
    } else {
      ctx.setLineDash([]);
    }

    if (action.type === 'draw') {
      if (!action.path || action.path.length === 0) return;

      if (action.penStyle === 'highlighter') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = action.width * 2.5;
        ctx.lineCap = 'square';
      } else if (action.penStyle === 'calligraphy') {
        // Draw calligraphic angled lines
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        action.path.forEach((p, i) => {
          ctx.moveTo(p.x - action.width / 2, p.y - action.width);
          ctx.lineTo(p.x + action.width / 2, p.y + action.width);
        });
        ctx.stroke();
        ctx.restore();
        return;
      } else if (action.penStyle === 'eraser') {
        ctx.strokeStyle = '#090b10'; // Background color matches eraser
        ctx.lineWidth = action.width * 4;
      }

      ctx.beginPath();
      ctx.moveTo(action.path[0].x, action.path[0].y);
      for (let i = 1; i < action.path.length; i++) {
        ctx.lineTo(action.path[i].x, action.path[i].y);
      }
      ctx.stroke();

    } else if (action.type === 'rect') {
      const w = action.endX! - action.x;
      const h = action.endY! - action.y;
      
      if (action.fill === 'semi') {
        ctx.fillStyle = hexToRGBA(action.color, 0.15);
        ctx.fillRect(action.x, action.y, w, h);
      } else if (action.fill === 'solid') {
        ctx.fillStyle = action.color;
        ctx.fillRect(action.x, action.y, w, h);
      }
      ctx.strokeRect(action.x, action.y, w, h);

    } else if (action.type === 'circle') {
      const cx = (action.x + action.endX!) / 2;
      const cy = (action.y + action.endY!) / 2;
      const rx = Math.abs(action.endX! - action.x) / 2;
      const ry = Math.abs(action.endY! - action.y) / 2;
      
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      if (action.fill === 'semi') {
        ctx.fillStyle = hexToRGBA(action.color, 0.15);
        ctx.fill();
      } else if (action.fill === 'solid') {
        ctx.fillStyle = action.color;
        ctx.fill();
      }
      ctx.stroke();

    } else if (action.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(action.x, action.y);
      ctx.lineTo(action.endX!, action.endY!);
      ctx.stroke();

    } else if (action.type === 'arrow') {
      const angle = Math.atan2(action.endY! - action.y, action.endX! - action.x);
      const headLength = 12 + action.width;
      
      ctx.beginPath();
      ctx.moveTo(action.x, action.y);
      ctx.lineTo(action.endX!, action.endY!);
      ctx.stroke();
      
      // Arrowhead paths
      ctx.beginPath();
      ctx.moveTo(action.endX!, action.endY!);
      ctx.lineTo(
        action.endX! - headLength * Math.cos(angle - Math.PI / 6),
        action.endY! - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(action.endX!, action.endY!);
      ctx.lineTo(
        action.endX! - headLength * Math.cos(angle + Math.PI / 6),
        action.endY! - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();

    } else if (action.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(action.x + (action.endX! - action.x) / 2, action.y);
      ctx.lineTo(action.endX!, action.endY!);
      ctx.lineTo(action.x, action.endY!);
      ctx.closePath();
      
      if (action.fill === 'semi') {
        ctx.fillStyle = hexToRGBA(action.color, 0.15);
        ctx.fill();
      } else if (action.fill === 'solid') {
        ctx.fillStyle = action.color;
        ctx.fill();
      }
      ctx.stroke();
    }

    ctx.restore();
  };

  // Re-draw grid + all historical actions
  const redrawAll = (ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    ctx.save();
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Scale for high resolution display (backing store scale)
    ctx.scale(2, 2);
    
    // Apply pan & zoom transforms
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    
    // Draw background grid
    drawGrid(ctx, canvas.width / 2, canvas.height / 2);
    
    // Redraw history
    history.forEach(action => {
      // Sticky notes are overlay elements, skip rendering them directly on canvas
      if (action.type !== 'sticky') {
        renderAction(ctx, action);
      }
    });

    // Render active lasers
    Object.entries(activeLasers).forEach(([userName, laser]) => {
      if (Date.now() - laser.timestamp > 1500) return;
      const path = laser.path;
      if (!path || path.length === 0) return;
      
      ctx.save();
      ctx.strokeStyle = laser.color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = laser.color;
      ctx.shadowBlur = 8;
      
      const age = Date.now() - laser.timestamp;
      const opacity = Math.max(0, 1 - age / 1500);
      ctx.globalAlpha = opacity;
      
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.stroke();
      
      const tip = path[path.length - 1];
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = laser.color;
      ctx.fill();
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = 'bold 9px sans-serif';
      ctx.shadowBlur = 0;
      ctx.fillText(userName, tip.x + 10, tip.y + 3);
      
      ctx.restore();
    });

    ctx.restore();
  };

  // Helpers to get coordinate details relative to canvas layout
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const xs = e.clientX - rect.left;
    const ys = e.clientY - rect.top;
    
    let x = (xs - panX) / zoom;
    let y = (ys - panY) / zoom;
    
    // Grid snapping alignment
    if (snapToGrid && !['brush', 'highlighter', 'calligraphy', 'eraser', 'laser', 'pan'].includes(tool)) {
      x = Math.round(x / 25) * 25;
      y = Math.round(y / 25) * 25;
    }
    
    return { x, y };
  };

  // Interaction handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 1. Pan Action Check
    if (spacePressed || tool === 'pan') {
      setIsPanning(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    const { x, y } = getCoordinates(e);
    
    if (tool === 'sticky') {
      const text = prompt('Enter note text:', 'Idea...') || '';
      if (!text.trim()) return;

      const newSticky: DrawAction = {
        id: `stick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'sticky',
        x,
        y,
        color,
        width: 1,
        text
      };

      setHistory(prev => [...prev, newSticky]);
      socket?.emit('draw-action', { teamId, action: newSticky });
      return;
    }

    setIsDrawing(true);
    setStartX(x);
    setStartY(y);

    if (['brush', 'highlighter', 'calligraphy', 'eraser', 'laser'].includes(tool)) {
      contextRef.current?.beginPath();
      contextRef.current?.moveTo(x, y);
      setCurrentPath([{ x, y }]);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const now = Date.now();
    if (socket && now - lastEmitRef.current > 30) {
      lastEmitRef.current = now;
      const coords = getCoordinates(e);
      socket.emit('cursor-move', { teamId, target: 'whiteboard', x: coords.x, y: coords.y });
    }

    // 1. Pan Execution Check
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setPanX(prev => prev + dx);
      setPanY(prev => prev + dy);
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!isDrawing) return;
    const { x, y } = getCoordinates(e);
    const ctx = contextRef.current;
    if (!ctx) return;

    if (tool === 'laser') {
      const laserPath = [...currentPath, { x, y }];
      setCurrentPath(laserPath);

      // Local update
      const userName = localStorage.getItem('hackhub_user')
        ? JSON.parse(localStorage.getItem('hackhub_user')!).name
        : 'Me';
      
      setActiveLasers(prev => ({
        ...prev,
        [userName]: {
          path: laserPath,
          color,
          timestamp: Date.now()
        }
      }));

      // Broadcast
      socket?.emit('draw-action', {
        teamId,
        action: {
          id: `laser-${Date.now()}`,
          type: 'laser',
          x: 0,
          y: 0,
          color,
          width: 4,
          text: userName,
          path: laserPath
        }
      });
      return;
    }

    if (['brush', 'highlighter', 'calligraphy', 'eraser'].includes(tool)) {
      redrawAll(ctx);
      
      ctx.save();
      ctx.strokeStyle = tool === 'eraser' ? '#090b10' : color;
      ctx.lineWidth = tool === 'eraser' ? strokeWidth * 4 : strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'highlighter') {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = strokeWidth * 2.5;
        ctx.lineCap = 'square';
      } else if (tool === 'calligraphy') {
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.beginPath();
        // Since we are redrawing from path, redraw calligraphic angle preview
        const p = [...currentPath, { x, y }];
        p.forEach((pt) => {
          ctx.moveTo(pt.x - strokeWidth / 2, pt.y - strokeWidth);
          ctx.lineTo(pt.x + strokeWidth / 2, pt.y + strokeWidth);
        });
        ctx.stroke();
        ctx.restore();
        setCurrentPath(prev => [...prev, { x, y }]);
        return;
      }

      ctx.beginPath();
      const p = [...currentPath, { x, y }];
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) {
        ctx.lineTo(p[i].x, p[i].y);
      }
      ctx.stroke();
      ctx.restore();
      
      setCurrentPath(prev => [...prev, { x, y }]);
    } else {
      // Shape tool: Redraw entire canvas history and draw preview of shape
      redrawAll(ctx);
      
      const previewAction: DrawAction = {
        id: 'preview',
        type: tool as any,
        x: startX,
        y: startY,
        endX: x,
        endY: y,
        color,
        width: strokeWidth,
        style: strokeStyle,
        fill: fillMode
      };
      
      renderAction(ctx, previewAction);
    }
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    
    const { x, y } = getCoordinates(e);
    const ctx = contextRef.current;
    if (!ctx) return;

    if (tool === 'laser') {
      setCurrentPath([]);
      const userName = localStorage.getItem('hackhub_user')
        ? JSON.parse(localStorage.getItem('hackhub_user')!).name
        : 'Me';
      setTimeout(() => {
        setActiveLasers(prev => {
          const next = { ...prev };
          delete next[userName];
          return next;
        });
        redrawAll(ctx);
      }, 1000);
      return;
    }

    const actionId = `draw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let finalAction: DrawAction | null = null;

    if (['brush', 'highlighter', 'calligraphy', 'eraser'].includes(tool)) {
      if (currentPath.length > 0) {
        finalAction = {
          id: actionId,
          type: 'draw',
          x: 0,
          y: 0,
          color,
          width: strokeWidth,
          penStyle: tool as any,
          path: currentPath
        };
      }
    } else {
      // Final shape action
      // Prevent creating 0-size shapes from a single click
      if (Math.abs(startX - x) > 3 || Math.abs(startY - y) > 3) {
        finalAction = {
          id: actionId,
          type: tool as any,
          x: startX,
          y: startY,
          endX: x,
          endY: y,
          color,
          width: strokeWidth,
          style: strokeStyle,
          fill: fillMode
        };
      }
    }

    if (finalAction) {
      setHistory(prev => [...prev, finalAction!]);
      socket?.emit('draw-action', { teamId, action: finalAction });
    } else {
      // If action was cancelled/invalid, redraw to clear the preview
      redrawAll(ctx);
    }

    setCurrentPath([]);
  };

  const handleClearWhiteboard = () => {
    if (!window.confirm('Are you sure you want to clear the entire whiteboard?')) return;
    setHistory([]);
    socket?.emit('draw-clear', { teamId });
  };

  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    
    ctx.scale(2, 2);
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    
    drawGrid(ctx, offscreen.width / 2, offscreen.height / 2);
    
    history.forEach(action => {
      if (action.type !== 'sticky') {
        renderAction(ctx, action);
      }
    });
    
    const dataUrl = offscreen.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = dataUrl;
    link.click();
  };

  // Drag listeners for stickies
  const startDragSticky = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const sticky = history.find(item => item.id === id);
    if (!sticky) return;
    
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    
    setDraggedStickyId(id);
    
    // Calculate screen space coordinates of the sticky note
    const stickyScreenX = panX + sticky.x * zoom;
    const stickyScreenY = panY + sticky.y * zoom;
    
    setDragOffset({
      x: (e.clientX - rect.left) - stickyScreenX,
      y: (e.clientY - rect.top) - stickyScreenY
    });
  };

  const handleDragSticky = (e: React.MouseEvent) => {
    if (!draggedStickyId) return;
    
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    
    // Screen space target position relative to container
    const mxs = e.clientX - rect.left - dragOffset.x;
    const mys = e.clientY - rect.top - dragOffset.y;
    
    // Map container screen coordinates back to world coordinates
    const newX = (mxs - panX) / zoom;
    const newY = (mys - panY) / zoom;

    setHistory(prev => prev.map(item => item.id === draggedStickyId ? { ...item, x: newX, y: newY } : item));
  };

  const stopDragSticky = () => {
    if (!draggedStickyId) return;
    
    const stick = history.find(item => item.id === draggedStickyId);
    if (stick) {
      socket?.emit('draw-action', { 
        teamId, 
        action: { 
          id: stick.id, 
          type: 'sticky-move', 
          x: stick.x, 
          y: stick.y, 
          color: stick.color, 
          width: 1 
        } 
      });
    }
    setDraggedStickyId(null);
  };

  const handleDoubleClickSticky = (id: string) => {
    const sticky = history.find(item => item.id === id);
    if (!sticky) return;

    const newText = prompt('Edit note text:', sticky.text) || '';
    if (!newText.trim()) return;

    setHistory(prev => prev.map(item => item.id === id ? { ...item, text: newText } : item));
    socket?.emit('draw-action', { 
      teamId, 
      action: { 
        id, 
        type: 'sticky-edit', 
        text: newText, 
        color: sticky.color, 
        x: sticky.x, 
        y: sticky.y, 
        width: 1 
      } 
    });
  };

  const handleDeleteSticky = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this note?')) return;

    setHistory(prev => prev.filter(item => item.id !== id));
    socket?.emit('draw-action', { 
      teamId, 
      action: { 
        id, 
        type: 'sticky-delete', 
        x: 0, 
        y: 0, 
        color: '', 
        width: 1 
      } 
    });
  };

  const stickies = history.filter(item => item.type === 'sticky');

  return (
    <div 
      className="flex flex-col h-[78vh] glass-panel rounded-2xl overflow-hidden border-slate-800" 
      ref={containerRef}
      onMouseMove={handleDragSticky}
      onMouseUp={stopDragSticky}
      onMouseLeave={stopDragSticky}
    >
      {/* Tool bar */}
      <div className="glass-panel px-4 py-3 rounded-t-2xl border-b border-slate-900/60 flex flex-wrap gap-4 items-center justify-between bg-slate-950/60 z-20">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pen / Style group */}
          <div className="flex bg-slate-900/80 p-0.5 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setTool('brush')}
              title="Brush Pen"
              className={`p-2 rounded-lg transition-all ${
                tool === 'brush' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Brush className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('highlighter')}
              title="Highlighter"
              className={`p-2 rounded-lg transition-all ${
                tool === 'highlighter' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Highlighter className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('calligraphy')}
              title="Calligraphy Brush"
              className={`p-2 rounded-lg transition-all font-mono text-xs flex items-center justify-center h-[34px] w-[36px] ${
                tool === 'calligraphy' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ✍️
            </button>
            <button
              onClick={() => setTool('eraser')}
              title="Eraser"
              className={`p-2 rounded-lg transition-all ${
                tool === 'eraser' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eraser className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('pan')}
              title="Pan Board (or Hold Space + Drag)"
              className={`p-2 rounded-lg transition-all ${
                tool === 'pan' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hand className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('laser')}
              title="Laser Pointer"
              className={`p-2 rounded-lg transition-all ${
                tool === 'laser' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Shapes Group */}
          <div className="flex bg-slate-900/80 p-0.5 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setTool('rect')}
              title="Rectangle Shape"
              className={`p-2 rounded-lg transition-all ${
                tool === 'rect' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Square className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('circle')}
              title="Circle Shape"
              className={`p-2 rounded-lg transition-all ${
                tool === 'circle' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Circle className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('line')}
              title="Straight Line"
              className={`p-2 rounded-lg transition-all ${
                tool === 'line' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Minus className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('arrow')}
              title="Arrow Line"
              className={`p-2 rounded-lg transition-all ${
                tool === 'arrow' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowRight className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setTool('triangle')}
              title="Triangle Shape"
              className={`p-2 rounded-lg transition-all ${
                tool === 'triangle' ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Triangle className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Sticky notes */}
          <button
            onClick={() => setTool('sticky')}
            className={`p-2 px-3 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold ${
              tool === 'sticky' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <StickyNote className="h-4.5 w-4.5" /> Note
          </button>
        </div>

        {/* Thickness, dash styles, fills & colors */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Stroke Width Selector */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-xl border border-slate-800/80">
            {[2, 5, 8, 12].map(w => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center ${
                  strokeWidth === w ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <div style={{ width: `${w + 2}px`, height: `${w + 2}px` }} className="rounded-full bg-current shrink-0" />
              </button>
            ))}
          </div>

          {/* Line Style Selector */}
          <div className="flex bg-slate-900/80 p-0.5 rounded-xl border border-slate-800/80">
            {(['solid', 'dashed', 'dotted'] as const).map(style => (
              <button
                key={style}
                onClick={() => setStrokeStyle(style)}
                className={`p-1.5 px-2.5 rounded-lg text-[10px] uppercase font-bold transition ${
                  strokeStyle === style ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {style}
              </button>
            ))}
          </div>

          {/* Shape Fill Mode Selector */}
          <div className="flex bg-slate-900/80 p-0.5 rounded-xl border border-slate-800/80">
            {(['none', 'semi', 'solid'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setFillMode(mode)}
                className={`p-1.5 px-2.5 rounded-lg text-[10px] uppercase font-bold transition ${
                  fillMode === mode ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {mode === 'none' ? 'No Fill' : mode === 'semi' ? 'Trans' : 'Solid'}
              </button>
            ))}
          </div>

          {/* Color Picker Palette */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1.5 border border-slate-800">
            {['#ffe500', '#ff4d8d', '#4d7cff', '#b8ff3c', '#ff6b35', '#f5f1e6'].map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 border-2 transition ${
                  color === c ? 'scale-110 border-white ring-2 ring-yellow-400' : 'border-black opacity-80 hover:opacity-100'
                }`}
              />
            ))}
            <input 
              type="color" 
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-5 h-5 overflow-hidden border-none outline-none cursor-pointer bg-transparent"
              title="Custom Color"
            />
          </div>

          {/* Snap to Grid */}
          <button
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={`p-2 transition ${
              snapToGrid ? 'bg-indigo-500/25 border border-indigo-500/40 text-indigo-400 font-bold' : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Snap to Grid"
          >
            <Grid className="h-4.5 w-4.5" />
          </button>

          {/* Zoom & Pan Controls */}
          <div className="flex bg-slate-900/80 p-0.5 border border-slate-800 items-center">
            <button
              onClick={() => setZoom(z => Math.max(0.25, z - 0.15))}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition"
              title="Zoom Out"
            >
              <ZoomOut className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
              className="px-2 text-[9px] font-extrabold text-slate-400 hover:text-slate-200 transition min-w-[36px] text-center"
              title="Reset Zoom & Pan"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom(z => Math.min(4, z + 0.15))}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition"
              title="Zoom In"
            >
              <ZoomIn className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            className="p-2 bg-slate-900 hover:bg-slate-850 text-emerald-400 hover:text-emerald-350 border border-slate-800 transition"
            title="Export to PNG"
          >
            <Download className="h-4.5 w-4.5" />
          </button>

          <button
            onClick={handleClearWhiteboard}
            className="p-2 bg-slate-800 hover:bg-slate-700/80 text-rose-400 hover:text-rose-300 transition"
            title="Clear Board"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div className="flex-1 relative bg-[#16161d] cursor-crosshair overflow-hidden select-none border-t-3 border-[#f5f1e6]">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="absolute inset-0 block"
        />

        {/* Sticky notes overlays */}
        {stickies.map((s) => (
          <div
            key={s.id}
            onMouseDown={(e) => startDragSticky(e, s.id)}
            onDoubleClick={() => handleDoubleClickSticky(s.id)}
            style={{ 
              left: `${panX + s.x * zoom}px`, 
              top: `${panY + s.y * zoom}px`, 
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              backgroundColor: `${s.color}25`,
              borderColor: s.color 
            }}
            className="absolute p-3 pt-5.5 rounded-lg border shadow-lg w-[140px] min-h-[90px] font-semibold text-xs text-white backdrop-blur-sm group select-none cursor-grab active:cursor-grabbing"
          >
            {/* Action buttons on hover */}
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button 
                onClick={(e) => handleDeleteSticky(s.id, e)}
                className="w-4.5 h-4.5 rounded bg-slate-900/80 hover:bg-rose-500/20 text-rose-400 border border-slate-800 flex items-center justify-center text-[9px] font-bold"
                title="Delete"
              >
                ✕
              </button>
            </div>
            
            <div className="absolute top-1 left-2 text-[8px] text-slate-500 font-bold uppercase tracking-wider select-none">
              Note
            </div>
            
            <div className="whitespace-pre-wrap break-words mt-1 leading-normal select-none pr-1">
              {s.text}
            </div>
          </div>
        ))}

        {/* Remote Cursors Overlay */}
        {Object.values(remoteCursors).map((cursor) => (
          <div
            key={cursor.socketId}
            style={{ 
              left: `${panX + cursor.x * zoom}px`, 
              top: `${panY + cursor.y * zoom}px`,
              transform: 'translate(-2px, -2px)'
            }}
            className="absolute z-40 pointer-events-none flex items-center gap-1 transition-all duration-75 ease-out"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={cursor.color}
              stroke="#000000"
              strokeWidth="2"
              className="drop-shadow-[1px_1px_0px_#000]"
            >
              <path d="M3 3l7 18 3-7 7-3L3 3z" />
            </svg>
            <span
              className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-black border-2 border-black shadow-[2px_2px_0px_#000] whitespace-nowrap"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
