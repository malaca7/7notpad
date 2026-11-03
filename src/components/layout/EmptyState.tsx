import React from 'react';
import { Plus, CheckSquare, Users, Lightbulb, FileText } from 'lucide-react';

interface EmptyStateProps {
  onCreateNote: (template?: { title: string; content: string }) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onCreateNote }) => {
  const templates = [
    {
      title: 'Nota em Branco',
      icon: Plus,
      desc: 'Comece a escrever livremente',
      data: { title: '', content: '' }
    },
    {
      title: 'Lista de Tarefas',
      icon: CheckSquare,
      desc: 'Checklist diária organizada',
      data: {
        title: 'Tarefas de Hoje ✅',
        content: `
          <h2>Metas Prioritárias</h2>
          <ul data-type="taskList">
            <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div>Primeira tarefa importante</div></li>
            <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div>Revisar documentos e notas</div></li>
            <li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div>Abrir o 7NotPad</div></li>
          </ul>
        `
      }
    },
    {
      title: 'Pauta de Reunião',
      icon: Users,
      desc: 'Anotações, participantes e ações',
      data: {
        title: 'Reunião de Alinhamento 📋',
        content: `
          <h2>Pauta de Reunião</h2>
          <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
          <p><strong>Participantes:</strong> Todos os envolvidos</p>
          <hr/>
          <h3>Pontos Discutidos</h3>
          <ul>
            <li>Progresso das entregas semanais</li>
            <li>Próximos passos e prazos</li>
          </ul>
          <h3>Ações Definidas</h3>
          <ul data-type="taskList">
            <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div>Enviar resumo por e-mail</div></li>
          </ul>
        `
      }
    },
    {
      title: 'Ideia de Projeto',
      icon: Lightbulb,
      desc: 'Brainstorming e especificações',
      data: {
        title: 'Novo Projeto 💡',
        content: `
          <h2>Visão Geral do Projeto</h2>
          <p>Descreva o objetivo principal deste projeto e o problema que ele resolve.</p>
          <blockquote><p>Foco na simplicidade, velocidade e valor para os usuários.</p></blockquote>
          <h3>Funcionalidades Chave</h3>
          <ol>
            <li>Interface minimalista e intuitiva</li>
            <li>Segurança sem fricção</li>
          </ol>
        `
      }
    }
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-center bg-gray-50/50 dark:bg-dark-surface/50">
      <div className="max-w-lg w-full space-y-6">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-brand-600/20 to-cyan-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center shadow-lg shadow-brand-500/10">
          <FileText className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Nenhuma nota selecionada
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Selecione uma nota na barra lateral ou inicie uma nova nota com um clique ou através dos modelos rápidos abaixo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left">
          {templates.map((tpl, i) => {
            const Icon = tpl.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onCreateNote(tpl.data)}
                className="p-4 rounded-2xl border border-gray-200 dark:border-[#232838] bg-white dark:bg-[#14161f] hover:border-brand-500/50 hover:bg-gray-50 dark:hover:bg-[#181b24] transition-all group shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  {tpl.title}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {tpl.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
