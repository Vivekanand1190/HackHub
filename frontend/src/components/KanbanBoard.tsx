import { API_BASE } from '../utils/api';
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  User, 
  AlignLeft,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  ListTodo,
  Clock
} from 'lucide-react';
import { Socket } from 'socket.io-client';

interface Member {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  column: string;
  assigneeId: string | null;
  assignee: { name: string } | null;
  deadline: string | null;
  timeSpent: number;
  checklist: string;
}

interface KanbanBoardProps {
  socket: Socket | null;
  teamId: string;
  members: Member[];
  initialTasks: Task[];
}

export default function KanbanBoard({ socket, teamId, members, initialTasks }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddForm, setShowAddForm] = useState<string | null>(null); // column name
  
  // Add form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);

  // Stopwatch States
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<string | null>(null);
  const [activeTimerInterval, setActiveTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});

  // Checklist Collapsible States & Inputs
  const [collapsedChecklists, setCollapsedChecklists] = useState<Record<string, boolean>>({});
  const [newSubtaskInputs, setNewSubtaskInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Synchronize ticking elapsed times mapping with tasks array
  useEffect(() => {
    const times: Record<string, number> = {};
    tasks.forEach(t => {
      times[t.id] = t.timeSpent || 0;
    });
    setElapsedTimes(prev => {
      const next = { ...times };
      if (activeTimerTaskId) {
        next[activeTimerTaskId] = prev[activeTimerTaskId] || times[activeTimerTaskId] || 0;
      }
      return next;
    });
  }, [tasks, activeTimerTaskId]);

  // Cleanup stopwatch interval on unmount
  useEffect(() => {
    return () => {
      if (activeTimerInterval) clearInterval(activeTimerInterval);
    };
  }, [activeTimerInterval]);

  // Sync tasks in real-time on socket updates
  useEffect(() => {
    if (!socket) return;

    const refreshTasks = async () => {
      try {
        const token = localStorage.getItem('hackhub_token');
        const res = await fetch(`${API_BASE}/api/teams/${teamId}/workspace`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTasks(data.tasks);
        }
      } catch (err) {
        console.error('Failed to sync tasks:', err);
      }
    };

    socket.on('task-update', refreshTasks);

    return () => {
      socket.off('task-update', refreshTasks);
    };
  }, [socket, teamId]);

  // Stopwatch Controller logic
  const handleStartTimer = (taskId: string) => {
    if (activeTimerTaskId) {
      handlePauseTimer(activeTimerTaskId);
    }

    setActiveTimerTaskId(taskId);
    const interval = setInterval(() => {
      setElapsedTimes(prev => ({
        ...prev,
        [taskId]: (prev[taskId] || 0) + 1
      }));
    }, 1000);

    setActiveTimerInterval(interval);
  };

  const handlePauseTimer = async (taskId: string) => {
    if (activeTimerInterval) {
      clearInterval(activeTimerInterval);
      setActiveTimerInterval(null);
    }
    setActiveTimerTaskId(null);

    const currentTime = elapsedTimes[taskId] || 0;
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: taskToUpdate.title,
          description: taskToUpdate.description,
          column: taskToUpdate.column,
          assigneeId: taskToUpdate.assigneeId,
          deadline: taskToUpdate.deadline,
          timeSpent: currentTime,
          checklist: taskToUpdate.checklist
        })
      });

      if (res.ok) {
        socket?.emit('task-update', { teamId });
      }
    } catch (err) {
      console.error('Failed to update stopwatch time:', err);
    }
  };

  // Format stopwatch duration into readable text
  const formatTime = (secondsTotal: number) => {
    const h = Math.floor(secondsTotal / 3600);
    const m = Math.floor((secondsTotal % 3600) / 60);
    const s = secondsTotal % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Toggle Sub-task Checkbox
  const toggleSubtask = async (taskId: string, subtaskId: string) => {
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    let checklistArray: any[] = [];
    try {
      checklistArray = typeof taskToUpdate.checklist === 'string' 
        ? JSON.parse(taskToUpdate.checklist || '[]') 
        : (taskToUpdate.checklist || []);
    } catch (e) {}

    const updatedChecklist = checklistArray.map((item: any) => 
      item.id === subtaskId ? { ...item, done: !item.done } : item
    );

    // Optimistically update state
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, checklist: JSON.stringify(updatedChecklist) } : t));

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: taskToUpdate.title,
          description: taskToUpdate.description,
          column: taskToUpdate.column,
          assigneeId: taskToUpdate.assigneeId,
          deadline: taskToUpdate.deadline,
          timeSpent: elapsedTimes[taskId] || taskToUpdate.timeSpent,
          checklist: updatedChecklist
        })
      });

      if (res.ok) {
        socket?.emit('task-update', { teamId });
      }
    } catch (err) {
      console.error('Subtask toggle save error:', err);
    }
  };

  // Add Sub-task checklist item
  const handleAddSubtask = async (e: React.FormEvent, taskId: string) => {
    e.preventDefault();
    const text = newSubtaskInputs[taskId] || '';
    if (!text.trim()) return;

    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (!taskToUpdate) return;

    let checklistArray: any[] = [];
    try {
      checklistArray = typeof taskToUpdate.checklist === 'string' 
        ? JSON.parse(taskToUpdate.checklist || '[]') 
        : (taskToUpdate.checklist || []);
    } catch (e) {}

    const newItem = {
      id: `sub-${Date.now()}`,
      text: text.trim(),
      done: false
    };

    const updatedChecklist = [...checklistArray, newItem];

    // Optimistically update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, checklist: JSON.stringify(updatedChecklist) } : t));
    setNewSubtaskInputs(prev => ({ ...prev, [taskId]: '' }));

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: taskToUpdate.title,
          description: taskToUpdate.description,
          column: taskToUpdate.column,
          assigneeId: taskToUpdate.assigneeId,
          deadline: taskToUpdate.deadline,
          timeSpent: elapsedTimes[taskId] || taskToUpdate.timeSpent,
          checklist: updatedChecklist
        })
      });

      if (res.ok) {
        socket?.emit('task-update', { teamId });
      }
    } catch (err) {
      console.error('Subtask creation error:', err);
    }
  };

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetCol: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const taskToMove = tasks.find(t => t.id === taskId);
    if (!taskToMove || taskToMove.column === targetCol) return;

    // Optimistically update UI
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column: targetCol } : t));

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          column: targetCol,
          title: taskToMove.title,
          description: taskToMove.description,
          assigneeId: taskToMove.assigneeId,
          deadline: taskToMove.deadline,
          timeSpent: elapsedTimes[taskId] || taskToMove.timeSpent,
          checklist: taskToMove.checklist
        })
      });

      if (res.ok) {
        socket?.emit('task-update', { teamId });
      }
    } catch (err) {
      console.error('Failed to move task:', err);
    }
  };

  const handleAddTask = async (e: React.FormEvent, column: string) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          description,
          column,
          teamId,
          assigneeId: assigneeId || undefined,
          deadline: deadline || undefined
        })
      });

      if (res.ok) {
        const newTask = await res.json();
        setTasks(prev => [...prev, newTask]);
        socket?.emit('task-update', { teamId });

        // Reset form
        setTitle('');
        setDescription('');
        setAssigneeId('');
        setDeadline('');
        setShowAddForm(null);
      }
    } catch (err) {
      console.error('Create task error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    // Optimistically update UI
    setTasks(prev => prev.filter(t => t.id !== taskId));

    try {
      const token = localStorage.getItem('hackhub_token');
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        socket?.emit('task-update', { teamId });
      }
    } catch (err) {
      console.error('Delete task error:', err);
    }
  };

  const toggleChecklistCollapsible = (taskId: string) => {
    setCollapsedChecklists(prev => ({
      ...prev,
      [taskId]: !(prev[taskId] ?? true)
    }));
  };

  const renderColumn = (colName: string, titleLabel: string, borderTheme: string, bgTheme: string) => {
    const colTasks = tasks.filter(t => t.column === colName);

    return (
      <div 
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, colName)}
        className="flex-1 flex flex-col h-full bg-slate-900/20 glass-panel p-4 rounded-2xl border-slate-800"
      >
        {/* Column Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${borderTheme}`} />
            <h4 className="font-bold text-sm text-slate-300">{titleLabel}</h4>
            <span className="text-[10px] bg-slate-800/80 text-slate-400 px-2 py-0.5 rounded-full font-bold">
              {colTasks.length}
            </span>
          </div>
          <button 
            onClick={() => setShowAddForm(showAddForm === colName ? null : colName)}
            className="p-1 rounded bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-100 transition"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Task Creator Form Inline */}
        {showAddForm === colName && (
          <form 
            onSubmit={(e) => handleAddTask(e, colName)}
            className="p-3.5 mb-4 rounded-xl border border-indigo-500/20 bg-slate-950/60 flex flex-col gap-3"
          >
            <input 
              type="text" 
              placeholder="Task Title..." 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="glass-input text-xs py-1.5! px-3!"
              required
            />
            
            <textarea 
              placeholder="Description details..." 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-input text-xs py-1.5! px-3! h-12 resize-none"
            />

            <select 
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="glass-input text-[11px] py-1.5! px-3!"
            >
              <option value="">Assign To...</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <input 
              type="date" 
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="glass-input text-[11px] py-1.5! px-3!"
            />

            <div className="flex justify-end gap-2 text-[10px]">
              <button 
                type="button" 
                onClick={() => setShowAddForm(null)}
                className="glass-button-secondary py-1! px-2.5!"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={loading}
                className="glass-button py-1! px-2.5!"
              >
                Create
              </button>
            </div>
          </form>
        )}

        {/* Tasks List */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
          {colTasks.length === 0 ? (
            <div className="flex-1 border border-dashed border-slate-800 rounded-xl flex items-center justify-center p-6 text-center text-xs text-slate-600">
              Drag tasks here
            </div>
          ) : (
            colTasks.map(task => {
              let parsedChecklist: any[] = [];
              try {
                parsedChecklist = typeof task.checklist === 'string'
                  ? JSON.parse(task.checklist || '[]')
                  : (task.checklist || []);
              } catch (e) {}

              const completedSubtasks = parsedChecklist.filter(c => c.done).length;
              const totalSubtasks = parsedChecklist.length;
              const subtaskPercent = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
              const isChecklistCollapsed = collapsedChecklists[task.id] ?? true;
              const isTicking = activeTimerTaskId === task.id;
              const timeSpentNow = elapsedTimes[task.id] || 0;

              return (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  className="glass-panel p-4 rounded-xl border-slate-800/80 bg-slate-950/20 hover:border-slate-700 cursor-grab active:cursor-grabbing flex flex-col gap-2 relative group"
                >
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(task.id)}
                    className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-450 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  <h5 className="font-bold text-xs text-slate-200 pr-5">{task.title}</h5>

                  {task.description && (
                    <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                      {task.description}
                    </p>
                  )}

                  {/* Stopwatch Stopwatch Segment */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-slate-900 text-[10px] mt-1">
                    <span className="text-slate-550 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-indigo-400" /> Time spent: {formatTime(timeSpentNow)}
                    </span>
                    {isTicking ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePauseTimer(task.id);
                        }}
                        className="flex items-center gap-1 text-[9px] font-extrabold uppercase text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20 shadow-sm shadow-rose-500/15"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartTimer(task.id);
                        }}
                        className="flex items-center gap-1 text-[9px] font-extrabold uppercase text-emerald-400 hover:text-emerald-350 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 shadow-sm"
                      >
                        <Play className="h-2.5 w-2.5 fill-current" />
                        Start
                      </button>
                    )}
                  </div>

                  {/* Subtasks Checklist Section */}
                  <div className="flex flex-col gap-1.5 mt-1">
                    <button
                      onClick={() => toggleChecklistCollapsible(task.id)}
                      className="flex items-center justify-between text-[10px] font-bold text-slate-400 hover:text-slate-200"
                    >
                      <span className="flex items-center gap-1.5">
                        <ListTodo className="h-3.5 w-3.5 text-indigo-400" /> 
                        Checklist ({completedSubtasks}/{totalSubtasks})
                      </span>
                      {isChecklistCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                    </button>

                    {totalSubtasks > 0 && (
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-950 mt-0.5">
                        <div 
                          className="bg-indigo-550 h-full rounded-full transition-all duration-300"
                          style={{ width: `${subtaskPercent}%` }}
                        />
                      </div>
                    )}

                    {!isChecklistCollapsed && (
                      <div className="flex flex-col gap-1.5 mt-1.5 pl-1.5 border-l border-slate-900">
                        {parsedChecklist.map((sub: any) => (
                          <div 
                            key={sub.id} 
                            onClick={() => toggleSubtask(task.id, sub.id)}
                            className="flex items-center gap-2 text-[10px] text-slate-300 hover:text-white cursor-pointer transition group/sub"
                          >
                            {sub.done ? (
                              <CheckSquare className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                            ) : (
                              <Square className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                            )}
                            <span className={sub.done ? 'line-through text-slate-550' : ''}>{sub.text}</span>
                          </div>
                        ))}

                        <form 
                          onSubmit={(e) => handleAddSubtask(e, task.id)}
                          className="flex items-center gap-2 mt-1"
                        >
                          <input
                            type="text"
                            placeholder="Add subtask..."
                            value={newSubtaskInputs[task.id] || ''}
                            onChange={(e) => setNewSubtaskInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                            className="bg-slate-950 border border-slate-900 rounded py-0.5 px-2 text-[9px] w-full text-slate-300 focus:outline-none focus:border-indigo-500/30"
                          />
                          <button type="submit" className="p-1 bg-indigo-500/10 border border-indigo-500/30 rounded text-indigo-400 hover:bg-indigo-500/20">
                            <Plus className="h-3 w-3" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>

                  {/* Assignee & Deadline footer */}
                  <div className="flex items-center justify-between border-t border-slate-900/60 pt-2.5 mt-1 text-[9px] text-slate-500 font-medium">
                    {task.assignee ? (
                      <span className="flex items-center gap-1.5 text-indigo-455 font-semibold">
                        <User className="h-3 w-3" /> {task.assignee.name}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-605">
                        <User className="h-3 w-3" /> Unassigned
                      </span>
                    )}

                    {task.deadline && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" /> 
                        {new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full max-h-full items-stretch pb-4">
      {renderColumn('todo', 'To Do', 'bg-indigo-400', 'bg-indigo-500/10')}
      {renderColumn('inprogress', 'In Progress', 'bg-purple-400', 'bg-purple-500/10')}
      {renderColumn('done', 'Done', 'bg-emerald-400', 'bg-emerald-500/10')}
    </div>
  );
}
