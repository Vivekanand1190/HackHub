import prisma from '../prisma';

export interface CopilotAnalysis {
  suggestions: string[];
  bugs: string[];
  features: string[];
  pitchTips: string[];
  readinessScore: number; // 0 to 100
}

export class CopilotService {
  static async analyzeTeam(teamId: string): Promise<CopilotAnalysis> {
    // 1. Gather all team information
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        tasks: true,
        messages: {
          take: 30,
          orderBy: { timestamp: 'desc' },
          include: { user: true }
        },
        snippets: {
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        documents: true,
        members: true
      }
    });

    if (!team) {
      throw new Error('Team not found');
    }

    const tasks = team.tasks || [];
    const messages = team.messages || [];
    const snippets = team.snippets || [];
    const documents = team.documents || [];
    const members = team.members || [];

    const todoCount = tasks.filter((t: any) => t.column === 'todo').length;
    const progressCount = tasks.filter((t: any) => t.column === 'inprogress').length;
    const doneCount = tasks.filter((t: any) => t.column === 'done').length;
    const totalTasks = tasks.length;

    // Calculate deterministic readiness score based on real metrics
    let score = 0;
    if (totalTasks > 0) {
      score += Math.round((doneCount / totalTasks) * 40);
      score += Math.round((progressCount / totalTasks) * 15);
    }
    if (snippets.length > 0) {
      score += Math.min(snippets.length * 5, 20);
    }
    if (documents.length > 0) {
      score += Math.min(documents.length * 10, 20);
    }
    if (messages.length > 0) {
      score += Math.min(messages.length * 1, 10);
    }
    if (members.length > 1) {
      score += 10;
    }
    score = Math.min(Math.max(score, 0), 100);

    const suggestions: string[] = [];
    const bugs: string[] = [];
    const features: string[] = [];
    const pitchTips: string[] = [];

    // Analyze snippets for actual issues
    snippets.forEach((snip: any) => {
      const code = snip.code || '';
      if (code.includes('threw')) {
        bugs.push(`Syntax error in '${snip.title}': Unexpected keyword 'threw' used instead of 'throw'.`);
      }
      if (code.match(/(key|secret|password|token)\s*=\s*['"][a-zA-Z0-9_\-]{8,}['"]/i)) {
        bugs.push(`Security Risk in '${snip.title}': Hardcoded secret or token string detected.`);
      }
      if (code.includes('CORS') && code.includes('*')) {
        bugs.push(`Security Risk in '${snip.title}': Wildcard CORS origin ('*') enabled.`);
      }
      if (code.includes('eval(')) {
        bugs.push(`Security Vulnerability in '${snip.title}': Usage of dynamic 'eval()' function detected.`);
      }
    });

    // Real Suggestions based on workspace state
    if (totalTasks === 0) {
      suggestions.push("Create your first task card in the Kanban board to organize project work.");
    } else if (todoCount > doneCount) {
      suggestions.push(`Move some of the ${todoCount} pending task(s) to 'In Progress' or 'Done'.`);
    }

    if (snippets.length === 0) {
      suggestions.push("Add code snippets to the Live Editor so team members can review shared code.");
    }

    if (documents.length === 0) {
      suggestions.push("Create a project README document detailing the architecture and setup instructions.");
    }

    if (messages.length === 0) {
      suggestions.push("Use the team chat channel to communicate and share updates with teammates.");
    }

    // Real Features based on team technology stack
    const allCode = snippets.map((s: any) => s.code).join(' ');
    if (allCode.includes('prisma')) {
      features.push("Database Integration: Use Prisma migrations and seeds to manage your database schema.");
    }
    if (allCode.includes('socket')) {
      features.push("Realtime Sync: Leverage Socket.IO events for instant state updates across clients.");
    }
    if (features.length === 0) {
      features.push("Add automated unit tests and health check endpoints for backend services.");
    }

    // Real Pitch Tips based on document and task status
    if (documents.length === 0) {
      pitchTips.push("Draft a concise problem statement and solution overview in Workspace Notes before presenting.");
    } else {
      pitchTips.push("Include practical demonstration steps showing how team members collaborate live in HackHub.");
    }
    pitchTips.push("State key metrics such as build speed, test coverage, and local execution efficiency in your pitch.");

    const analysis: CopilotAnalysis = {
      suggestions,
      bugs,
      features,
      pitchTips,
      readinessScore: score
    };

    // Save state in the database
    await prisma.team.update({
      where: { id: teamId },
      data: { copilotState: JSON.stringify(analysis) }
    });

    return analysis;
  }
}
