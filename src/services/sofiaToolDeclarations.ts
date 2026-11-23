/**
 * sofiaToolDeclarations.ts
 * Catálogo Único (Single Source of Truth) das Declarações de Funções da Assistente Sofia.
 * Compartilhado entre server.ts (Gemini Function Calling) e o cliente.
 * IMPORTANTE: Não importar bibliotecas de DOM/navegador neste arquivo para manter compatibilidade Node/Browser.
 */

export const SOFIA_FUNCTION_DECLARATIONS = [
  {
    name: 'consultarFrequenciaHoje',
    description:
      'Use quando perguntarem quantos alunos estão presentes, faltaram, são esperados ou se ainda há chamada pendente hoje (no Integral inteiro ou em uma turma específica), ou quando pedirem os nomes de quem veio ou faltou hoje.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description:
            'Nome opcional da turma (ex: "Infantil 1 Azul", "Maternal Azul", "1º Ano Laranja"). Omita para ver todas as turmas.',
        },
        listarNomes: {
          type: 'BOOLEAN',
          description:
            'Defina como true quando a pessoa pedir quem veio, quem faltou ou quem está pendente.',
        },
      },
    },
  },
  {
    name: 'obterResumoFrequenciaPorData',
    description:
      'Use quando perguntarem sobre a chamada, presenças ou faltas de uma data específica (ontem, anteontem, dia 28 ou qualquer data passada). Se a data for omitida, usa a data de hoje.',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: {
          type: 'STRING',
          description: 'Data opcional no formato YYYY-MM-DD ou DD/MM/YYYY. Padrão: hoje.',
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional para filtrar a frequência dessa data.',
        },
      },
    },
  },
  {
    name: 'gerar_pdf_frequencia',
    description:
      'Use sempre que a pessoa pedir para gerar, baixar ou imprimir um PDF ou relatório da chamada ou frequência do dia (de presentes, de faltas ou de todos, do Integral todo ou de uma turma específica).',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: {
          type: 'STRING',
          description: 'Data opcional no formato YYYY-MM-DD ou DD/MM/YYYY. Se omitida, usa hoje.',
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional para filtrar o PDF (ex: "Infantil 1 Azul"). Se omitida, inclui todas as turmas.',
        },
        tipo: {
          type: 'STRING',
          description: 'Quais alunos incluir no PDF: "presentes", "faltas" ou "todos". Padrão: "todos".',
          enum: ['presentes', 'faltas', 'todos'],
        },
      },
    },
  },
  {
    name: 'consultarAtividadesMomento',
    description:
      'Use quando perguntarem o que uma turma ou todas as turmas estão fazendo agora ou em um determinado horário (ex: se o Maternal Azul está na natação, quem está no almoço, o que acontece às 15h30).',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Nome opcional da turma. Se omitido, retorna todas as turmas no horário.',
        },
        horarioSimulado: {
          type: 'STRING',
          description: 'Horário opcional HH:mm (ex: "15:30"). Se omitido, usa a hora atual.',
        },
        data: {
          type: 'STRING',
          description: 'Data opcional YYYY-MM-DD. Se omitida, usa hoje.',
        },
      },
    },
  },
  {
    name: 'consultarGradeHoraria',
    description:
      'Use quando perguntarem toda a rotina/grade de horários do dia ou da semana de uma turma ou de uma oficina (ex: "que horas tem natação hoje?", "qual a grade do 1º Ano na sexta?").',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Nome opcional da turma.',
        },
        dia: {
          type: 'STRING',
          description: 'Dia da semana opcional ("segunda", "terca", "quarta", "quinta", "sexta") ou data YYYY-MM-DD. Padrão: hoje.',
        },
        atividade: {
          type: 'STRING',
          description: 'Nome opcional de uma modalidade/oficina (ex: "Natação", "Judô", "Balé", "Flauta").',
        },
      },
    },
  },
  {
    name: 'consultarLivroPonto',
    description:
      'Use quando perguntarem sobre batidas do Livro Ponto da equipe, quem bateu ponto, se há pendências de ponto (intervalo sem retorno, sem saída, só entrada) ou se algum colaborador deixou de registrar o ponto hoje ou em outra data.',
    parameters: {
      type: 'OBJECT',
      properties: {
        colaborador: {
          type: 'STRING',
          description: 'Nome opcional de um colaborador específico.',
        },
        data: {
          type: 'STRING',
          description: 'Data opcional YYYY-MM-DD ou DD/MM/YYYY. Se omitida, usa hoje.',
        },
      },
    },
  },
  {
    name: 'analisarDesarranjosDoDia',
    description:
      'Use quando pedirem um resumo geral do dia para a coordenação/direção, panorama completo ou verificação de pendências gerais (chamadas pendentes por turma, presença total, saídas e livro ponto).',
    parameters: {
      type: 'OBJECT',
      properties: {
        foco: {
          type: 'STRING',
          description: 'Foco opcional: "geral", "frequencia" ou "ponto". Padrão: "geral".',
        },
      },
    },
  },
  {
    name: 'consultarAlertasSaidaHoje',
    description:
      'Use quando perguntarem quem vai embora de van/transporte escolar, quais saídas antecipadas estão previstas hoje ou quem já foi liberado pela portaria.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          description: 'Tipo opcional: "van", "antecipada" ou "geral". Padrão: "geral".',
          enum: ['van', 'antecipada', 'geral'],
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional para filtrar.',
        },
        detalhesVan: {
          type: 'BOOLEAN',
          description: 'Se true, lista os nomes dos alunos e do condutor.',
        },
      },
    },
  },
  {
    name: 'registrarSaidaAntecipada',
    description:
      'Use quando avisarem que um aluno vai sair mais cedo hoje (ex: "o Pedro vai sair 16h", "Maria do Infantil 1 sai antes às 15h30").',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome do aluno.',
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional, caso informada ou conhecida.',
        },
        horario: {
          type: 'STRING',
          description: 'Horário previsto da saída (ex: "16:00"). Se omitido, usa a hora atual.',
        },
        justificativa: {
          type: 'STRING',
          description: 'Motivo ou quem vem buscar, se informado.',
        },
      },
      required: ['alunoId'],
    },
  },
  {
    name: 'confirmarSaidaAluno',
    description:
      'Use quando informarem que um aluno já foi entregue/retirado ou acabou de sair do colégio (dar baixa de saída na portaria/rotina).',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: {
          type: 'STRING',
          description: 'Nome do aluno.',
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional.',
        },
        horario: {
          type: 'STRING',
          description: 'Horário opcional da saída. Padrão: hora atual.',
        },
        observacao: {
          type: 'STRING',
          description: 'Observação opcional (ex: quem buscou).',
        },
      },
      required: ['alunoId'],
    },
  },
  {
    name: 'consultarCardapio',
    description:
      'Use quando perguntarem o almoço, lanche, sobremesa ou cardápio de hoje, de amanhã ou de outra data, e também para verificar alunos com alergias ou restrições alimentares.',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: {
          type: 'STRING',
          description: 'Data opcional ("hoje", "amanha", YYYY-MM-DD ou DD/MM/YYYY). Padrão: hoje.',
        },
        turma: {
          type: 'STRING',
          description: 'Turma opcional para checar restrições alimentares.',
        },
      },
    },
  },
  {
    name: 'consultarSemanario',
    description:
      'Use quando perguntarem o planejamento do Semanário de uma turma ou dia: atividades propostas, tema da semana, objetivos e materiais.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Turma opcional.',
        },
        data: {
          type: 'STRING',
          description: 'Data opcional (YYYY-MM-DD ou DD/MM/YYYY). Padrão: hoje.',
        },
      },
    },
  },
  {
    name: 'consultarManualNormas',
    description:
      'Use quando tiverem dúvidas sobre regras, procedimentos ou protocolos do Colégio Crescer (uso de celular, rádio, saída, acidentes, alergias, acolhimento, normas internas).',
    parameters: {
      type: 'OBJECT',
      properties: {
        termoOuTema: {
          type: 'STRING',
          description: 'Assunto ou palavra-chave da dúvida.',
        },
      },
      required: ['termoOuTema'],
    },
  },
  {
    name: 'consultarAlunosOuTurma',
    description:
      'Use quando quiserem localizar um aluno específico (turma, horário de saída, contrato, transporte, alergias/observações) ou listar quantos/quais alunos fazem parte de uma turma.',
    parameters: {
      type: 'OBJECT',
      properties: {
        busca: {
          type: 'STRING',
          description: 'Nome completo ou parcial do aluno.',
        },
        turma: {
          type: 'STRING',
          description: 'Nome opcional da turma.',
        },
      },
    },
  },
  {
    name: 'consultarQuadroAtribuicoes',
    description:
      'Use quando perguntarem quem é a monitora titular, assistente ou ADI de uma turma, ou em qual turma determinada colaboradora trabalha.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turma: {
          type: 'STRING',
          description: 'Nome opcional da turma.',
        },
        colaborador: {
          type: 'STRING',
          description: 'Nome opcional da monitora ou ADI.',
        },
      },
    },
  },
  {
    name: 'navegarModulo',
    description:
      'Use quando pedirem para abrir ou ir para uma tela/aba do aplicativo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        modulo: {
          type: 'STRING',
          description:
            'Tela de destino: momento, frequencia, semanario, ponto, cardapio, alunos, financeiro, relatorio, manual.',
          enum: ['momento', 'frequencia', 'semanario', 'ponto', 'cardapio', 'alunos', 'financeiro', 'relatorio', 'manual'],
        },
      },
      required: ['modulo'],
    },
  },
  {
    name: 'gerarEspelhoPontoPDF',
    description:
      'Use quando pedirem para gerar ou baixar o espelho/folha de ponto mensal em PDF de um colaborador.',
    parameters: {
      type: 'OBJECT',
      properties: {
        colaboradorId: {
          type: 'STRING',
          description: 'Nome completo, parcial ou e-mail do colaborador. Se omitido, usa o usuário atual.',
        },
        mesAno: {
          type: 'STRING',
          description: 'Mês e ano opcionais (MM/AAAA ou YYYY-MM). Padrão: mês atual.',
        },
      },
    },
  },
  {
    name: 'gerarAutorizacaoEntradaSaidaPDF',
    description:
      'Use quando pedirem autorização em PDF para entrada com atraso ou saída antecipada de um aluno na portaria.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: { type: 'STRING', description: 'Nome do aluno.' },
        motivo: {
          type: 'STRING',
          description: '"atraso" ou "saida_antecipada".',
          enum: ['atraso', 'saida_antecipada'],
        },
        horario: { type: 'STRING', description: 'Horário opcional (HH:mm). Padrão: hora atual.' },
        justificativa: { type: 'STRING', description: 'Motivo ou observação opcional.' },
      },
      required: ['alunoId', 'motivo'],
    },
  },
  {
    name: 'gerarTermoSaidaAvulsa',
    description:
      'Use quando alguém autorizado vier retirar um aluno antes do horário na portaria e precisarem registrar a liberação com o documento do retirante e gerar o Termo de Saída Avulsa em PDF.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: { type: 'STRING', description: 'Nome do aluno.' },
        nomeRetirante: { type: 'STRING', description: 'Nome de quem está retirando o aluno.' },
        documentoRetirante: { type: 'STRING', description: 'RG ou CPF de quem retira (opcional).' },
        parentesco: { type: 'STRING', description: 'Vínculo ou parentesco (opcional).' },
        motivoSaida: { type: 'STRING', description: 'Motivo da saída (opcional).' },
        horarioSaida: { type: 'STRING', description: 'Horário da retirada (opcional; padrão: agora).' },
      },
      required: ['alunoId', 'nomeRetirante'],
    },
  },
  {
    name: 'registrarFaltaFrequencia',
    description:
      'Use quando pedirem para lançar falta de um aluno específico na chamada de hoje ou de uma data. Só grava quando confirmado: true; sem isso devolve um resumo para pedir confirmação ao usuário.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: { type: 'STRING', description: 'Nome do aluno.' },
        data: { type: 'STRING', description: 'Data opcional YYYY-MM-DD. Padrão: hoje.' },
        justificativa: { type: 'STRING', description: 'Motivo opcional da falta.' },
        confirmado: {
          type: 'BOOLEAN',
          description: 'Defina false na primeira chamada para conferir o resumo com o usuário. Só envie true após confirmação explícita do usuário.',
        },
      },
      required: ['alunoId'],
    },
  },
  {
    name: 'lancarFrequenciaTurma',
    description:
      'Use quando pedirem para lançar a chamada completa de uma turma em uma data (marcando todos presentes ou informando quem faltou). Só grava quando confirmado: true; sem isso devolve um resumo para pedir confirmação.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turmaId: { type: 'STRING', description: 'Nome da turma.' },
        data: { type: 'STRING', description: 'Data opcional YYYY-MM-DD. Padrão: hoje.' },
        chamadas: {
          type: 'ARRAY',
          description: 'Lista opcional de alunos com status presente (true/false). Se omitida, marca os alunos esperados como presentes.',
          items: {
            type: 'OBJECT',
            properties: {
              alunoId: { type: 'STRING', description: 'Nome ou identificador do aluno' },
              presente: { type: 'BOOLEAN', description: 'true para presente, false para falta' },
              observation: { type: 'STRING', description: 'Observação opcional' },
            },
            required: ['alunoId', 'presente'],
          },
        },
        confirmado: {
          type: 'BOOLEAN',
          description: 'Defina false na primeira chamada para conferir o resumo com o usuário. Só envie true após confirmação explícita do usuário.',
        },
      },
      required: ['turmaId'],
    },
  },
  {
    name: 'gerarListaChamadaPDF',
    description:
      'Use quando pedirem a lista nominal cadastral em PDF para impressão em branco (folha de chamada com nomes dos alunos da turma). Para PDF com presenças/faltas já lançadas hoje, prefira gerar_pdf_frequencia.',
    parameters: {
      type: 'OBJECT',
      properties: {
        turmaId: {
          type: 'STRING',
          description: 'Nome opcional da turma. Se omitido, usa a turma selecionada ou todas.',
        },
      },
    },
  },
  {
    name: 'dispararAlertaWhatsApp',
    description:
      'Use quando pedirem para preparar ou enviar um recado rápido via WhatsApp para a coordenação ou para um contato específico (envio em massa é exclusivo da coordenação). Só prepara o envio quando confirmado: true.',
    parameters: {
      type: 'OBJECT',
      properties: {
        destinatario: { type: 'STRING', description: 'Nome, telefone ou "coordenacao".' },
        mensagem: { type: 'STRING', description: 'Texto do recado.' },
        confirmado: {
          type: 'BOOLEAN',
          description: 'Defina false na primeira chamada para revisar destinatário e texto com o usuário. Só envie true após confirmação explícita.',
        },
      },
      required: ['destinatario', 'mensagem'],
    },
  },
  {
    name: 'cadastrarAluno',
    description:
      'Use quando pedirem para cadastrar um novo aluno no Integral (requer permissão de secretaria/coordenação).',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome completo do aluno' },
        turmaId: { type: 'STRING', description: 'Nome da turma' },
        responsavel: { type: 'STRING', description: 'Nome do responsável (opcional)' },
        telefone: { type: 'STRING', description: 'Telefone de contato (opcional)' },
        horarioEntradaSaida: { type: 'STRING', description: 'Horário contratual (opcional)' },
      },
      required: ['nome', 'turmaId'],
    },
  },
  {
    name: 'editarAluno',
    description:
      'Use quando pedirem para atualizar dados do cadastro de um aluno (horário, turma, observações, alergias). Só grava quando confirmado: true.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: { type: 'STRING', description: 'Nome do aluno' },
        dadosAtualizados: {
          type: 'OBJECT',
          description: 'Campos que devem ser atualizados',
        },
        confirmado: {
          type: 'BOOLEAN',
          description: 'Defina false na primeira chamada para confirmar as alterações com o usuário. Só envie true após confirmação explícita.',
        },
      },
      required: ['alunoId', 'dadosAtualizados'],
    },
  },
  {
    name: 'alterarAnoLetivoAluno',
    description:
      'Use quando a coordenação pedir para fazer rematrícula ou alterar o ano letivo de um aluno para 2026 ou 2027. Só grava quando confirmado: true.',
    parameters: {
      type: 'OBJECT',
      properties: {
        alunoId: { type: 'STRING', description: 'Nome do aluno' },
        novoAnoLetivo: { type: 'INTEGER', description: 'Ano letivo de destino (2026 ou 2027)' },
        confirmado: {
          type: 'BOOLEAN',
          description: 'Defina false na primeira chamada para confirmar com o usuário. Só envie true após confirmação explícita.',
        },
      },
      required: ['alunoId', 'novoAnoLetivo'],
    },
  },
  {
    name: 'cadastrarUsuario',
    description:
      'Use quando a coordenação pedir para cadastrar uma nova monitora, professora ou ADI no sistema. Só grava quando confirmado: true.',
    parameters: {
      type: 'OBJECT',
      properties: {
        nome: { type: 'STRING', description: 'Nome completo do colaborador' },
        email: { type: 'STRING', description: 'E-mail do colaborador' },
        funcao: { type: 'STRING', description: 'Função opcional no Integral' },
        cargo: { type: 'STRING', description: 'Cargo opcional' },
        perfil: {
          type: 'STRING',
          description: 'Perfil opcional: ADMIN, MONITOR ou ADI (padrão: MONITOR)',
          enum: ['ADMIN', 'MONITOR', 'ADI'],
        },
        confirmado: {
          type: 'BOOLEAN',
          description: 'Defina false na primeira chamada para confirmar os dados com o usuário. Só envie true após confirmação explícita.',
        },
      },
      required: ['nome', 'email'],
    },
  },
  {
    name: 'cadastrarRefeicaoCardapio',
    description:
      'Use quando a nutrição ou coordenação pedir para cadastrar ou atualizar o almoço ou lanche no cardápio de uma data.',
    parameters: {
      type: 'OBJECT',
      properties: {
        data: { type: 'STRING', description: 'Data opcional YYYY-MM-DD ou DD/MM/YYYY. Padrão: hoje.' },
        tipo: {
          type: 'STRING',
          description: 'Almoço ou Lanche (padrão: Almoço).',
          enum: ['Almoço', 'Lanche'],
        },
        descricao: { type: 'STRING', description: 'Descrição da refeição' },
      },
      required: ['descricao'],
    },
  },
  {
    name: 'consultarResumoFinanceiro',
    description:
      'Use quando a coordenação ou direção perguntar sobre receitas, despesas ou inadimplência do Programa Integral.',
    parameters: {
      type: 'OBJECT',
      properties: {
        anoLetivo: { type: 'INTEGER', description: 'Ano letivo opcional (padrão: ano atual).' },
      },
    },
  },
] as const;
