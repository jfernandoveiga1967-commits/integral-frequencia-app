/**
 * normasData.ts
 * Acervo Oficial do Manual de 51 Normas do Programa Integral — Colégio Crescer
 * Estrutura sequencial contínua com numeração única (Seções 1 a 51) distribuídas em 4 Módulos Oficiais:
 *
 * Módulo 1 (Rotina Operacional): Seções 1 a 16
 * Módulo 2 (Segurança, Espaços, Academia e Transporte): Seções 17 a 27
 * Módulo 3 (Postura, Fardamento e Proibições): Seções 28 a 38
 * Módulo 4 (Guia Socioemocional e Abordagem Sensível): Seções 39 a 51
 */

import type { ManualNorma, ModuleCategory, NormaType } from '../types/manualNormas';

export interface NormaDataRecord extends ManualNorma {
  section: string; // Ex: 'Seção 1', 'Seção 17', ... 'Seção 51'
}

export const NORMAS_DATA: NormaDataRecord[] = [
  {
    "id": "norma_01_objetivos_metas",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "1",
    "sectionNumber": "1",
    "sectionTitle": "Metas e Proposta do Integral",
    "title": "Objetivos Institucionais e Proposta do Programa de Integral",
    "type": "diretriz",
    "summary": "Oferecer um ambiente seguro, acolhedor e estimulante para o desenvolvimento global do aluno.",
    "details": [
      "Oferecer um ambiente acolhedor, seguro e estimulante para o pleno desenvolvimento físico, cognitivo e emocional dos alunos do Integral.",
      "Proporcionar vivências lúdicas, projetos pedagógicos e atividades recreativas que fortaleçam autonomia, socialização e espírito de equipe.",
      "Garantir assistência aos conteúdos pedagógicos e orientação atenta na realização das lições de casa.",
      "Promover hábitos saudáveis de alimentação equilibrada, hidratação e higiene bucal e corporal."
    ],
    "tags": [
      "objetivos",
      "metas",
      "desenvolvimento",
      "autonomia",
      "acolhimento",
      "integral",
      "seção 1"
    ],
    "order": 1
  },
  {
    "id": "norma_02_direitos_legais",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "2",
    "sectionNumber": "2",
    "sectionTitle": "Direitos da Colaboradora / Estagiária",
    "title": "Dos Direitos Legais e Prerrogativas Funcionais da Colaboradora",
    "type": "recomendado",
    "summary": "Garantias legais conforme o Termo de Compromisso e regimento do Colégio Crescer.",
    "details": [
      "Ser acolhida e orientada pela Coordenação do Integral sobre o funcionamento da rotina, roteiros e normas internas.",
      "Propor melhorias pedagógicas e operacionais para aprimorar o atendimento aos alunos.",
      "Participar das formações profissionais continuadas promovidas pelo colégio.",
      "Requisitar material didático e recursos necessários ao cumprimento do roteiro autorizado.",
      "Direito a 1 atraso justificado mensal de até 30 minutos devidamente formalizado por escrito."
    ],
    "tags": [
      "direitos",
      "estágio",
      "coordenação",
      "formação",
      "material",
      "atraso justificado",
      "seção 2"
    ],
    "order": 2
  },
  {
    "id": "norma_03_deveres_pontualidade",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "3",
    "sectionNumber": "3",
    "sectionTitle": "Assiduidade e Pontualidade",
    "title": "Dos Deveres Gerais, Pontualidade e Assiduidade Funcional",
    "type": "diretriz",
    "summary": "Cumprimento rigoroso da jornada de trabalho e postura ética no ambiente escolar.",
    "details": [
      "Cumprir com rigor os horários de entrada, refeições, trocas de oficinas e saída definidos pela escala.",
      "Comunicar faltas ou atrasos à Coordenação com antecedência mínima de 2 horas para viabilizar substituição.",
      "Apresentar atestado médico oficial em até 48 horas após a ausência.",
      "Manter conduta ética, respeitosa e proba com alunos, famílias e colegas de trabalho."
    ],
    "tags": [
      "pontualidade",
      "assiduidade",
      "horário",
      "atestado",
      "compromisso",
      "ética",
      "seção 3"
    ],
    "order": 3
  },
  {
    "id": "norma_04_ponto_armarios",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "4",
    "sectionNumber": "4",
    "sectionTitle": "Ponto e Pertences Pessoais",
    "title": "Registro de Ponto Eletrônico e Uso Exclusivo de Armários Individuais",
    "type": "diretriz",
    "summary": "Bater o ponto nos horários exatos e guardar bolsas, celulares e pertences nos armários.",
    "details": [
      "Registrar o ponto biométrico/digital na entrada, saída e intervalos previstos em contrato.",
      "Guardar bolsas, mochilas, celulares e pertences pessoais nos armários trancados antes de iniciar o atendimento.",
      "É proibido circular pelas salas com bolsas tiracolo ou mochilas pessoais.",
      "Zelar pela chave do armário e manutenção da ordem nos vestiários dos colaboradores."
    ],
    "tags": [
      "ponto",
      "armários",
      "bolsas",
      "guarda-volumes",
      "registro",
      "biometria",
      "seção 4"
    ],
    "order": 4
  },
  {
    "id": "norma_05_radio_comunicador",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "5",
    "sectionNumber": "5",
    "sectionTitle": "Comunicação Operacional",
    "title": "Comunicação Via Rádio Operacional e Manutenção na Frequência Oficial 2",
    "type": "diretriz",
    "summary": "Rádio ligado na frequência 2 para alinhamentos rápidos, recados e chamadas de portaria.",
    "details": [
      "Retirar o rádio no início do turno, conferindo bateria e fixando no canal oficial 2.",
      "Manter volume audível sem causar alarme desnecessário nas salas de aula.",
      "Usar linguagem objetiva e respeitosa, evitando brincadeiras na frequência institucional.",
      "Devolver o rádio na base carregadora ao término do expediente."
    ],
    "tags": [
      "rádio",
      "frequência 2",
      "comunicação",
      "portaria",
      "agilidade",
      "bateria",
      "seção 5"
    ],
    "order": 5
  },
  {
    "id": "norma_06_acomodacao_refeitorio",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "6",
    "sectionNumber": "6",
    "sectionTitle": "Condução ao Refeitório",
    "title": "Acomodação Harmoniosa e Condução das Turmas ao Refeitório",
    "type": "diretriz",
    "summary": "Deslocamento calmo, acomodação organizada e supervisão ativa durante todo o almoço.",
    "details": [
      "Conduzir os alunos em fila organizada até o refeitório nos horários da grade.",
      "Acomodar as crianças por turma garantindo espaço confortável para cada uma.",
      "Auxiliar no corte de carnes e abertura de embalagens para os menores.",
      "Supervisionar a mesa continuamente, sem deixar crianças desacompanhadas."
    ],
    "tags": [
      "refeitório",
      "almoço",
      "fila",
      "refeição",
      "mesa",
      "alimentação",
      "seção 6"
    ],
    "order": 6
  },
  {
    "id": "norma_07_incentivo_alimentar",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "7",
    "sectionNumber": "7",
    "sectionTitle": "Educação Nutricional",
    "title": "Incentivo Positivo à Alimentação Saudável e Consumo de Saladas",
    "type": "recomendado",
    "summary": "Estímulo gentil para que os alunos experimentem legumes, verduras e novos alimentos.",
    "details": [
      "Incentivar o consumo de saladas e legumes com comentários motivadores e lúdicos.",
      "Nunca forçar a ingestão ou repreender a criança que recusar determinado alimento.",
      "Respeitar a saciedade da criança mantendo diálogo acolhedor sobre nutrição.",
      "Anotar no caderno vai e volta quando houver recusa alimentar persistente."
    ],
    "tags": [
      "alimentação saudável",
      "salada",
      "incentivo",
      "nutrição",
      "prato",
      "acolhimento",
      "seção 7"
    ],
    "order": 7
  },
  {
    "id": "norma_08_prevencao_engasgo",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "8",
    "sectionNumber": "8",
    "sectionTitle": "Segurança na Deglutição",
    "title": "Prevenção de Engasgos, Postura à Mesa e Mastigação Calma",
    "type": "alerta",
    "summary": "Atenção redobrada na mastigação, postura sentada e proibição de correr com comida na boca.",
    "details": [
      "Garantir que todas as crianças permaneçam sentadas enquanto estiverem comendo.",
      "Proibir conversas agitadas, risadas com boca cheia ou correria perto das mesas.",
      "Orientar mastigação cuidadosa de pedaços pequenos de alimentos sólidos.",
      "Em caso de engasgo, manter a calma, solicitar apoio médico/enfermaria e agir conforme protocolo de primeiros socorros."
    ],
    "tags": [
      "engasgo",
      "deglutição",
      "postura",
      "mastigação",
      "primeiros socorros",
      "segurança",
      "seção 8"
    ],
    "order": 8
  },
  {
    "id": "norma_09_sobremesas_doces",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "9",
    "sectionNumber": "9",
    "sectionTitle": "Sobremesas e Lanches Externos",
    "title": "Distribuição Supervisionada de Sobremesas e Proibição de Doces Externos",
    "type": "diretriz",
    "summary": "Frutas e sobremesas oficiais após o prato principal e controle de guloseimas externas.",
    "details": [
      "A sobremesa oficial (frutas ou sobremesas do cardápio) é servida apenas após a refeição principal.",
      "É proibido que alunos consumam doces, salgadinhos industriais ou refrigerantes trazidos de casa sem autorização médica.",
      "Educadoras não devem distribuir guloseimas particulares às crianças como premiação.",
      "Guardar lanches que sobrarem devidamente identificados com o nome do aluno."
    ],
    "tags": [
      "sobremesa",
      "frutas",
      "doces proibidos",
      "guloseimas",
      "cardápio",
      "saúde",
      "seção 9"
    ],
    "order": 9
  },
  {
    "id": "norma_10_higiene_bucal",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "10",
    "sectionNumber": "10",
    "sectionTitle": "Escovação de Dentes",
    "title": "Higiene Bucal Pós-Refeições e Escovação Supervisionada",
    "type": "diretriz",
    "summary": "Conduzir as turmas para escovação dentária correta após o almoço e lanches.",
    "details": [
      "Organizar fila para o escovódromo mantendo torneiras fechadas durante a escovação.",
      "Orientar a dosagem adequada de creme dental (tamanho de uma ervilha).",
      "Garantir que cada criança use exclusivamente sua própria escova e toalhinha.",
      "Secar as escovas antes de guardá-las nos estojos individuais arejados."
    ],
    "tags": [
      "escovação",
      "dentes",
      "higiene bucal",
      "escova",
      "banheiro",
      "saúde bucal",
      "seção 10"
    ],
    "order": 10
  },
  {
    "id": "norma_11_acolhimento_mochilas",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "11",
    "sectionNumber": "11",
    "sectionTitle": "Acolhimento e Mochilas",
    "title": "Procedimentos de Acolhimento das Turmas e Organização de Mochilas",
    "type": "diretriz",
    "summary": "Recepção calorosa no início do turno e guarda organizada das mochilas nas canaletas e nichos.",
    "details": [
      "Recepcionar cada criança pelo nome, com sorriso e postura acolhedora na chegada.",
      "Acondicionar mochilas, lancheiras e casacos nos nichos identificados de cada aluno.",
      "Conferir se o aluno trouxe caderno de recados, agenda ou autorização médica do dia.",
      "Evitar que mochilas fiquem espalhadas pelo chão das salas de estudo e corredores."
    ],
    "tags": [
      "acolhimento",
      "mochilas",
      "organização",
      "recepção",
      "chegada",
      "nichos",
      "seção 11"
    ],
    "order": 11
  },
  {
    "id": "norma_12_rotina_soninho",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "12",
    "sectionNumber": "12",
    "sectionTitle": "Momento de Repouso",
    "title": "Rotina de Soninho, Repouso e Despertar Acolhedor",
    "type": "recomendado",
    "summary": "Colchonetes individuais higienizados, meia-luz, música suave e respeito a quem não dorme.",
    "details": [
      "Preparar a sala com colchonetes forrados, lençóis individuais e temperatura agradável.",
      "Colocar música relaxante em volume baixo e diminuir a intensidade da iluminação.",
      "Crianças que não dormem devem ter atividades calmas (leitura, desenho) sem atrapalhar os que dormem.",
      "Despertar suave com voz mansa e sem barulhos repentinos ou luzes acesas abruptamente."
    ],
    "tags": [
      "soninho",
      "repouso",
      "sono",
      "colchonete",
      "acolhimento",
      "descanso",
      "seção 12"
    ],
    "order": 12
  },
  {
    "id": "norma_13_licao_de_casa",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "13",
    "sectionNumber": "13",
    "sectionTitle": "Hora do Estudo",
    "title": "Diretrizes e Mediação da Lição de Casa por Faixa Etária",
    "type": "recomendado",
    "summary": "Ambiente silencioso, apoio pedagógico sem dar respostas prontas e visto no caderno de lição.",
    "details": [
      "Garantir concentração de 30 a 50 minutos diários conforme o ano escolar dos alunos.",
      "Auxiliar na compreensão do enunciado incentivando o raciocínio autônomo da criança.",
      "Nunca fazer a lição pela criança nem fornecer respostas de forma passiva.",
      "Apor visto no caderno de lição e sinalizar eventuais dificuldades para a coordenação."
    ],
    "tags": [
      "lição de casa",
      "dever",
      "estudo",
      "caderno",
      "autonomia",
      "reforço",
      "seção 13"
    ],
    "order": 13
  },
  {
    "id": "norma_14_caderno_frequencia",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "14",
    "sectionNumber": "14",
    "sectionTitle": "Fechamento do Dia e Registros",
    "title": "Caderno Vai e Volta e Lançamento Diário de Frequência no Sistema",
    "type": "diretriz",
    "summary": "Lançar presenças, ocorrências e notas de recado na plataforma e no caderno de comunicação antes da saída.",
    "details": [
      "Garantir que todas as chamadas estejam 100% lançadas e sem pendências no sistema oficial.",
      "Anotar recados importantes na agenda escolar para os responsáveis com clareza e cordialidade.",
      "Conferir itens pessoais e agasalhos dos alunos antes de encaminhá-los à saída.",
      "Relatar ocorrências do dia à assistente de coordenação ou educadora do próximo turno."
    ],
    "tags": [
      "caderno vai e volta",
      "frequência",
      "chamada",
      "sistema",
      "recados",
      "fechamento",
      "seção 14"
    ],
    "order": 14
  },
  {
    "id": "norma_15_saida_antecipada",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "15",
    "sectionNumber": "15",
    "sectionTitle": "Saída Fora do Horário",
    "title": "Procedimentos para Saída Antecipada e Autorizações Especiais",
    "type": "alerta",
    "summary": "Conferência prévia de bilhetes, registro de saída no sistema e comunicação com a portaria.",
    "details": [
      "Liberar o aluno apenas mediante comunicado escrito dos pais ou autorização expressa da Coordenação.",
      "Registrar o horário exato da saída antecipada no espelho diário e na chamada eletrônica.",
      "Acompanhar o aluno até a portaria oficial para entrega direta ao responsável.",
      "Nunca liberar o aluno pelo portão lateral ou sem conferência de documento de identidade."
    ],
    "tags": [
      "saída antecipada",
      "autorização",
      "portaria",
      "segurança",
      "sistema",
      "registro",
      "seção 15"
    ],
    "order": 15
  },
  {
    "id": "norma_16_protocolo_saida",
    "moduleId": "rotina_operacional",
    "moduleTitle": "Módulo 1: Rotina Operacional",
    "section": "16",
    "sectionNumber": "16",
    "sectionTitle": "Entrega dos Alunos",
    "title": "Protocolo Oficial de Entrega de Alunos na Saída e Conferência de Responsáveis",
    "type": "diretriz",
    "summary": "Entrega presencial no portão oficial, conferência visual e proibição de saída desacompanhada.",
    "details": [
      "Entregar a criança apenas a pais, responsáveis legais ou pessoas expressamente autorizadas no cadastro.",
      "Exigir documento com foto caso a pessoa não seja conhecida da equipe de portaria.",
      "Proibir que a criança atravesse o portão correndo ou sem estar acompanhada do adulto responsável.",
      "Manter a fila de saída calma e organizada até o último aluno ser entregue em segurança."
    ],
    "tags": [
      "entrega de alunos",
      "saída",
      "portão",
      "responsáveis",
      "cadastro",
      "conferência",
      "seção 16"
    ],
    "order": 16
  },
  {
    "id": "norma_17_vigilancia_ativa",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "17",
    "sectionNumber": "17",
    "sectionTitle": "Postura Preventiva",
    "title": "Postura Preventiva, Vigilância Ativa e Atenção Integral aos Alunos",
    "type": "diretriz",
    "summary": "Atenção visual 100% voltada aos alunos, posicionamento estratégico e proibição de conversas paralelas.",
    "details": [
      "Manter vigilância visual contínua, posicionando-se de forma a enxergar todo o grupo no ambiente.",
      "Evitar agrupamentos de colaboradoras e conversas paralelas durante o atendimento às crianças.",
      "Intervir imediatamente diante de brincadeiras de risco, empurrões ou aproximações de áreas perigosas.",
      "Nunca virar as costas para a turma ou permanecer distraída em pontos cegos dos pátios."
    ],
    "tags": [
      "vigilância ativa",
      "prevenção",
      "segurança",
      "atenção",
      "posicionamento",
      "supervisão",
      "seção 17"
    ],
    "order": 17
  },
  {
    "id": "norma_18_seguranca_parque",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "18",
    "sectionNumber": "18",
    "sectionTitle": "Uso do Parque / Parcão",
    "title": "Segurança no Parque, Parcão e Brinquedão Externo",
    "type": "alerta",
    "summary": "Monitoramento por zonas, revezamento atento e regras estritas nos brinquedos de escalada.",
    "details": [
      "Dividir a equipe nos pontos estratégicos do parque: escorregador, casinha, balanço e brinquedão.",
      "Proibir que crianças fiquem de pé nos balanços ou subam pelo lado contrário do escorregador.",
      "Conferir se o piso emborrachado está livre de pedras, galhos pontiagudos ou poças d'água escorregadias.",
      "Interromper brincadeiras agressivas e orientar uso respeitoso dos brinquedos."
    ],
    "tags": [
      "parque",
      "parcão",
      "brinquedão",
      "escorregador",
      "balanço",
      "queda",
      "segurança",
      "seção 18"
    ],
    "order": 18
  },
  {
    "id": "norma_19_supervisao_banheiros",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "19",
    "sectionNumber": "19",
    "sectionTitle": "Higiene e Privacidade",
    "title": "Supervisão Cuidadosa de Banheiros e Privacidade dos Alunos",
    "type": "diretriz",
    "summary": "Portas destrancadas, acompanhamento na entrada e respeito absoluto à intimidade da criança.",
    "details": [
      "Acompanhar turmas pequenas até a porta dos sanitários garantindo uso higiênico e ordeiro.",
      "Permanecer na entrada do sanitário mantendo escuta atenta sem invadir a cabine individual.",
      "Auxiliar apenas crianças que ainda não possuem autonomia completa para higiene pessoal.",
      "Garantir piso seco para prevenir escorregões e quedas nas áreas molhadas."
    ],
    "tags": [
      "banheiro",
      "higiene",
      "privacidade",
      "supervisão",
      "autonomia",
      "intimidade",
      "seção 19"
    ],
    "order": 19
  },
  {
    "id": "norma_20_travamento_portoes",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "20",
    "sectionNumber": "20",
    "sectionTitle": "Perímetro e Fechamentos",
    "title": "Fechamento Perimetral e Travamento Seguro de Portões e Grades",
    "type": "alerta",
    "summary": "Verificação contínua de trincos magnéticos, portões fechados e contenção contra evasão.",
    "details": [
      "Certificar-se de que todos os portões de acesso aos pátios estejam sempre fechados e travados.",
      "Nunca deixar trincos abertos ou escorados com cadeiras, pedras ou caixas.",
      "Reportar imediatamente à equipe de manutenção qualquer falha em fechaduras eletrônicas.",
      "Não permitir que alunos fiquem dependurados ou brinquem encostados nas grades externas."
    ],
    "tags": [
      "portões",
      "grades",
      "perímetro",
      "segurança física",
      "travamento",
      "evasão",
      "seção 20"
    ],
    "order": 20
  },
  {
    "id": "norma_21_controle_portaria",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "21",
    "sectionNumber": "21",
    "sectionTitle": "Acesso e Perímetro",
    "title": "Acesso, Identificação de Responsáveis e Controle de Portaria",
    "type": "diretriz",
    "summary": "Acesso controlado de visitantes, uso de crachá de identificação e autorização expressa.",
    "details": [
      "Visitantes e prestadores de serviços devem aguardar na recepção e portar crachá oficial.",
      "Colaboradoras não devem franquear entrada de pessoas sem cadastro ou sem ciência da portaria.",
      "Manter vigilância visual constante nas imediações da calçada e portão principal.",
      "Em caso de abordagem suspeita na calçada, acionar a recepção e a segurança escolar."
    ],
    "tags": [
      "portaria",
      "acesso",
      "visitantes",
      "crachá",
      "identificação",
      "segurança",
      "seção 21"
    ],
    "order": 21
  },
  {
    "id": "norma_22_emergencia_notificacao",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "22",
    "sectionNumber": "22",
    "sectionTitle": "Situações Críticas",
    "title": "Conduta de Emergência, Evasão e Notificação Imediata à Coordenação",
    "type": "proibicao",
    "summary": "Protocolo imediato diante de desaparecimento, acidentes graves ou risco estrutural.",
    "details": [
      "Acionar imediatamente a Coordenação via rádio frequência 2 e telefones de emergência.",
      "Manter o grupo de alunos reunido e calmo sob supervisão de outra colaboradora designada.",
      "Bloquear saídas e verificar sanitários, armários, salas desocupadas e áreas externas.",
      "Nunca divulgar informações sigilosas ou relatos de pânico nas redes sociais ou WhatsApp."
    ],
    "tags": [
      "emergência",
      "evasão",
      "desaparecimento",
      "rádio 2",
      "coordenação",
      "notificação",
      "seção 22"
    ],
    "order": 22
  },
  {
    "id": "norma_23_deslocamento_academia",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "23",
    "sectionNumber": "23",
    "sectionTitle": "Deslocamento Externo",
    "title": "Deslocamento Interno Organizado e Fila Segura para a Academia",
    "type": "diretriz",
    "summary": "Deslocamento em fila dupla, contagem de alunos na saída e chegada e travessia segura.",
    "details": [
      "Realizar a contagem nominal dos alunos antes de sair da sala e ao chegar no local da atividade.",
      "Posicionar uma monitora na frente como guia e outra obrigatoriamente no final da fila.",
      "Orientar as crianças a andarem sempre pelo lado interno da calçada, longe do meio-fio.",
      "Levar sempre garrafinhas de água, prancheta de frequência e rádio comunicador."
    ],
    "tags": [
      "academia",
      "deslocamento",
      "fila segura",
      "contagem",
      "calçada",
      "transporte",
      "seção 23"
    ],
    "order": 23
  },
  {
    "id": "norma_24_10_regras_academia",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "24",
    "sectionNumber": "24",
    "sectionTitle": "Comportamento na Academia",
    "title": "As 10 Regras Oficiais de Comportamento e Postura na Academia",
    "type": "alerta",
    "summary": "Não correr na borda da piscina, atenção aos vestiários e respeito aos instrutores esportivos.",
    "details": [
      "Leitura e reforço verbal das 10 regras antes de iniciar o trajeto até o complexo esportivo.",
      "Proibição absoluta de correr na borda da piscina ou empurrar colegas nos vestiários.",
      "Supervisão atenta nos banheiros da academia com troca de touca e óculos de natação.",
      "Garantir que todos os pertences retornem dentro das mochilas identificadas dos alunos."
    ],
    "tags": [
      "academia",
      "10 regras",
      "natação",
      "piscina",
      "vestiário",
      "segurança aquática",
      "seção 24"
    ],
    "order": 24
  },
  {
    "id": "norma_25_retorno_academia",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "25",
    "sectionNumber": "25",
    "sectionTitle": "Retorno ao Colégio",
    "title": "Segurança no Retorno da Academia: Monitora como Última da Fila",
    "type": "diretriz",
    "summary": "A monitora deve ser a última pessoa a cruzar o portão, garantindo que ninguém fique para trás.",
    "details": [
      "A monitora responsável pelo fechamento da fila deve ser rigorosamente a última a adentrar o portão do colégio.",
      "Verificar se nenhuma criança ficou para trás no vestiário da academia ou na calçada.",
      "Conferir a contagem total de cabeças imediatamente na entrada da portaria.",
      "Registrar no relatório qualquer intercorrência ou atendimento ocorrido no local parceiro."
    ],
    "tags": [
      "retorno academia",
      "última da fila",
      "portão",
      "contagem",
      "segurança",
      "conferência",
      "seção 25"
    ],
    "order": 25
  },
  {
    "id": "norma_26_troca_uniforme_aquatica",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "26",
    "sectionNumber": "26",
    "sectionTitle": "Troca de Roupas Pós-Natação",
    "title": "Troca de Uniforme Pós-Atividades Aquáticas e Proibição de Chinelos",
    "type": "diretriz",
    "summary": "Troca completa de maiô/sunga molhados para uniforme seco e colocação de tênis antes de voltar às salas.",
    "details": [
      "Alunos não devem circular de chinelo ou cabelos escorrendo água pelas salas do colégio.",
      "Guardar roupas molhadas em sacos impermeáveis dentro das mochilas individuais.",
      "Secar bem as crianças e colocar tênis com meias para evitar quedas no piso liso.",
      "Garantir a privacidade dos alunos durante o momento da troca nos vestiários."
    ],
    "tags": [
      "natação",
      "roupa molhada",
      "troca de roupa",
      "tênis",
      "chinelo proibido",
      "vestiário",
      "seção 26"
    ],
    "order": 26
  },
  {
    "id": "norma_27_seguranca_culinaria",
    "moduleId": "seguranca_cuidados",
    "moduleTitle": "Módulo 2: Segurança, Espaços, Academia e Transporte",
    "section": "27",
    "sectionNumber": "27",
    "sectionTitle": "Oficina de Culinária",
    "title": "Boas Práticas e Segurança na Cozinha Pedagógica de Culinária",
    "type": "alerta",
    "summary": "Touca de cabelo, avental limpo, distância segura de fornos e manuseio restrito de utensílios cortantes.",
    "details": [
      "Apenas a educadora responsável manuseia facas afiadas e abre o forno quente.",
      "Lavagem rigorosa das mãos e uso de toucas antes de manipular qualquer ingrediente.",
      "Conferir previamente a lista de alergias da turma antes de oferecer os ingredientes aos alunos.",
      "Higienizar bancadas antes e depois da oficina mantendo o ambiente impecável."
    ],
    "tags": [
      "culinária",
      "cozinha",
      "fogo",
      "facas",
      "higiene",
      "alergias",
      "segurança",
      "seção 27"
    ],
    "order": 27
  },
  {
    "id": "norma_28_padrao_fardamento",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "28",
    "sectionNumber": "28",
    "sectionTitle": "Identificação Funcional e Vestuário",
    "title": "Padrão Oficial de Fardamento, Identificação e Higiene Pessoal",
    "type": "diretriz",
    "summary": "Uso obrigatório do uniforme limpo, calçado fechado e crachá de identificação durante toda a jornada.",
    "details": [
      "Camiseta do Integral/Colégio Crescer sempre limpa, alinhada e sem customizações inadequadas.",
      "Calça confortável (jeans escuro ou legging preta sem transparência) e tênis fechado para mobilidade e segurança.",
      "Cabelos presos durante o atendimento às crianças e distribuição de refeições.",
      "Crachá de identificação funcional visível durante todo o expediente de trabalho.",
      "É estritamente proibido o uso de chinelos, rasteirinhas ou vestimentas decotadas/inadequadas."
    ],
    "tags": [
      "uniforme",
      "fardamento",
      "roupa",
      "crachá",
      "tênis",
      "cabelo preso",
      "identificação",
      "seção 28"
    ],
    "order": 28
  },
  {
    "id": "norma_29_proibicao_celular",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "29",
    "sectionNumber": "29",
    "sectionTitle": "Uso de Dispositivos Eletrônicos",
    "title": "Proibição Estrita de Uso de Aparelhos Celulares em Horário de Atendimento",
    "type": "proibicao",
    "summary": "Aparelhos devem ficar desligados ou em modo silencioso guardados no armário individual.",
    "details": [
      "É estritamente proibido o uso de smartphone, smartwatch ou fones durante o atendimento às crianças.",
      "Mensagens pessoais e redes sociais devem ser acessadas exclusivamente no intervalo oficial de descanso.",
      "Em caso de urgência familiar, os contatos devem ser direcionados à linha fixa da Coordenação.",
      "O uso do celular durante a vigilância de pátio ou parque é infração disciplinar grave sujeita a advertência."
    ],
    "tags": [
      "celular proibido",
      "smartphone",
      "fones",
      "atenção plena",
      "infração grave",
      "disciplina",
      "seção 29"
    ],
    "order": 29
  },
  {
    "id": "norma_30_comunicacao_etica",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "30",
    "sectionNumber": "30",
    "sectionTitle": "Ética e Discrição",
    "title": "Comunicação Respeitosa, Ética Profissional e Discrição Institucional",
    "type": "diretriz",
    "summary": "Discrição sobre assuntos de alunos e famílias, postura respeitosa e proibição de fofocas.",
    "details": [
      "Guardar sigilo absoluto sobre histórico familiar, laudos médicos e comportamentos de alunos.",
      "Não expor crianças, famílias ou colegas de equipe em grupos de mensagens ou redes sociais.",
      "Conversas delicadas devem ocorrer em ambiente reservado com a Coordenação Pedagógica.",
      "Manter tratamento cordial e equilibrado com todos os membros da comunidade escolar."
    ],
    "tags": [
      "ética",
      "sigilo",
      "discrição",
      "respeito",
      "famílias",
      "comunicação",
      "seção 30"
    ],
    "order": 30
  },
  {
    "id": "norma_31_papeis_equipe",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "31",
    "sectionNumber": "31",
    "sectionTitle": "Hierarquia e Funções",
    "title": "Classificação e Papéis Funcionais da Equipe de Monitoria",
    "type": "diretriz",
    "summary": "Clara divisão de atribuições entre Assistente de Coordenação, Monitoras Líderes e Apoio.",
    "details": [
      "Assistente de Coordenação: apoio direto à gestão, alinhamento de escalas e fiscalização geral.",
      "Monitora Líder: condução da rotina pedagógica e acompanhamento direto das turmas designadas.",
      "Monitora de Apoio: suporte às transições, refeitório, trocas de fraldas e oficinas especializadas.",
      "Respeito mútuo à cadeia de orientações estabelecida pela Direção e Coordenação."
    ],
    "tags": [
      "hierarquia",
      "papéis",
      "líder",
      "apoio",
      "assistente",
      "atribuições",
      "seção 31"
    ],
    "order": 31
  },
  {
    "id": "norma_32_substituicoes_apoio",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "32",
    "sectionNumber": "32",
    "sectionTitle": "Flexibilidade e Apoio Mútuo",
    "title": "Disponibilidade para Substituições e Apoio Mútuo entre Turmas",
    "type": "recomendado",
    "summary": "Espírito de cooperação para cobrir intervalos e faltas emergenciais conforme solicitação da coordenação.",
    "details": [
      "Colaborar prontamente no remanejamento temporário de turmas em casos de ausências médicas.",
      "Interagir harmoniosamente com a equipe pedagógica do turno regular do colégio.",
      "Prestar assistência imediata a colegas em momentos de pico no refeitório ou pátio.",
      "Promover um clima de colaboração ativa e suporte mútuo permanente."
    ],
    "tags": [
      "substituição",
      "apoio mútuo",
      "cooperação",
      "flexibilidade",
      "trabalho em equipe",
      "seção 32"
    ],
    "order": 32
  },
  {
    "id": "norma_33_formacao_pedagogica",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "33",
    "sectionNumber": "33",
    "sectionTitle": "Desenvolvimento Profissional",
    "title": "Participação Obrigatória em Reuniões de Formação Pedagógica",
    "type": "diretriz",
    "summary": "Presença e pontualidade nos encontros mensais de treinamento e alinhamento pedagógico.",
    "details": [
      "Comparecer pontualmente às formações institucionais promovidas pelo Colégio Crescer.",
      "Estudar os manuais de rotina, protocolos de segurança e diretrizes socioemocionais.",
      "Aplicar em sala as metodologias e orientações recebidas durante os treinamentos.",
      "Assinar a lista de presença e os termos de ciência dos conteúdos ministrados."
    ],
    "tags": [
      "formação",
      "treinamento",
      "reunião",
      "capacitação",
      "aprendizado",
      "seção 33"
    ],
    "order": 33
  },
  {
    "id": "norma_34_proibicoes_gerais_eca",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "34",
    "sectionNumber": "34",
    "sectionTitle": "Salvaguarda da Criança e ECA",
    "title": "Proibições Gerais, Salvaguarda da Criança e Conformidade com o ECA",
    "type": "proibicao",
    "summary": "Proibições rigorosas de castigos, humilhações, fotos sem autorização e violações aos direitos infantis.",
    "details": [
      "É estritamente proibido aplicar castigos físicos, psicológicos, isolamento vexatório ou humilhação pública.",
      "É proibido fotografar, filmar ou publicar imagens dos alunos em redes sociais pessoais.",
      "Proibido fornecer alimentos não autorizados ou medicar crianças sem respaldo da enfermaria.",
      "Qualquer suspeita de violação de direitos da criança deve ser imediatamente comunicada à Direção conforme o Estatuto da Criança e do Adolescente (ECA)."
    ],
    "tags": [
      "proibições gerais",
      "ECA",
      "direitos da criança",
      "salvaguarda",
      "fotos proibidas",
      "infração grave",
      "seção 34"
    ],
    "order": 34
  },
  {
    "id": "norma_35_alergias_alimentares",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "35",
    "sectionNumber": "35",
    "sectionTitle": "Segurança Alimentar Crítica",
    "title": "Identificação e Prevenção Rigorosa de Alergias e Intolerâncias Alimentares",
    "type": "alerta",
    "summary": "Atenção estrita aos alunos com fichas de alergia a leite, glúten, ovo, oleaginosas e corantes.",
    "details": [
      "Conferir diariamente a lista nominal de restrições alimentares e alergias graves da turma.",
      "Garantir pratos e talheres diferenciados e higienizados sem contaminação cruzada.",
      "Nunca oferecer alimentos de colegas para crianças alérgicas sob hipótese alguma.",
      "Diante de sinais alérgicos (urticária, inchaço, tosse súbita), acionar a Enfermaria imediatamente."
    ],
    "tags": [
      "alergia",
      "intolerância",
      "segurança alimentar",
      "glúten",
      "lactose",
      "enfermaria",
      "seção 35"
    ],
    "order": 35
  },
  {
    "id": "norma_36_medicamentos_prescricao",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "36",
    "sectionNumber": "36",
    "sectionTitle": "Administração de Remédios",
    "title": "Administração Segura de Medicamentos Apenas com Prescrição Médica",
    "type": "alerta",
    "summary": "Apenas a enfermaria ou colaboradora autorizada administra remédios mediante receita médica atualizada.",
    "details": [
      "Não medicar nenhuma criança sem receita médica original e autorização expressa dos pais.",
      "Medicamentos devem ficar guardados no armário chaveado da enfermaria escolar.",
      "Conferir nome da criança, dosagem e horário antes de administrar qualquer fármaco.",
      "Registrar a administração no prontuário e comunicar a Coordenação."
    ],
    "tags": [
      "medicamentos",
      "remédio",
      "prescrição",
      "receita",
      "enfermaria",
      "autorização",
      "seção 36"
    ],
    "order": 36
  },
  {
    "id": "norma_37_primeiros_socorros_enfermaria",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "37",
    "sectionNumber": "37",
    "sectionTitle": "Acidentes e Quedas",
    "title": "Atendimento Imediato a Acidentes e Notificação à Enfermaria Escolar",
    "type": "alerta",
    "summary": "Encaminhamento calmo à enfermaria, socorro imediato e preenchimento de ficha de ocorrência.",
    "details": [
      "Em caso de quedas ou escoriações, manter a calma e conduzir a criança à enfermaria.",
      "Acidentes com impacto na cabeça exigem observação médica imediata e contato telefônico com os pais.",
      "Nunca minimizar a queixa de dor da criança ou aplicar compressas sem orientação técnica.",
      "Preencher a ficha oficial de ocorrência escolar e entregar à Coordenação."
    ],
    "tags": [
      "acidente",
      "queda",
      "primeiros socorros",
      "enfermaria",
      "machucado",
      "ocorrência",
      "seção 37"
    ],
    "order": 37
  },
  {
    "id": "norma_38_penalidades_medidas",
    "moduleId": "postura_fardamento",
    "moduleTitle": "Módulo 3: Postura, Fardamento e Proibições",
    "section": "38",
    "sectionNumber": "38",
    "sectionTitle": "Regime Disciplinar",
    "title": "Das Penalidades e Medidas Educativas por Descumprimento de Normas",
    "type": "proibicao",
    "summary": "Graduação das medidas: feedback orientador, advertência verbal, advertência escrita e rescisão.",
    "details": [
      "1ª Ocorrência leve: Diálogo educativo e feedback formal com a Coordenação.",
      "2ª Ocorrência ou reincidência: Advertência escrita anexada ao prontuário funcional.",
      "Faltas graves (abandono de posto, agressão verbal, uso indevido de celular no parque): Suspensão ou rescisão imediata do contrato.",
      "O cumprimento das normas visa salvaguardar a integridade das crianças e o padrão do colégio."
    ],
    "tags": [
      "penalidades",
      "advertência",
      "disciplina",
      "rescisão",
      "deveres",
      "regimento",
      "seção 38"
    ],
    "order": 38
  },
  {
    "id": "norma_39_sensivel_apresentacao",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "39",
    "sectionNumber": "39",
    "sectionTitle": "Carta da Coordenação",
    "title": "Apresentação Oficial do Guia de Abordagem Sensível e Respeitosa",
    "type": "diretriz",
    "summary": "Carta de princípios da Coordenação Pedagógica (Fernando Veiga) sobre afeto, acolhimento e firmeza gentil.",
    "details": [
      "O Guia de Abordagem Sensível estabelece o compromisso institucional com a infância protegida e respeitada.",
      "Educar com empatia e afeto não significa permissividade, mas mediação assertiva com respeito mútuo.",
      "Toda criança merece ser acolhida em seus sentimentos, recebendo escuta atenta e orientação positiva.",
      "Cada colaboradora é modelo vivo de conduta, equilíbrio emocional e gentileza para os alunos."
    ],
    "tags": [
      "guia sensível",
      "apresentação",
      "coordenação",
      "afeto",
      "acolhimento",
      "fernando veiga",
      "seção 39"
    ],
    "order": 39
  },
  {
    "id": "norma_40_nao_gritar",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "40",
    "sectionNumber": "40",
    "sectionTitle": "Comunicação Acolhedora",
    "title": "Comunicação Calma e Firmeza Gentil: Proibição Estrita de Gritar",
    "type": "proibicao",
    "summary": "Tom de voz equilibrado e respeito. Gritar desestabiliza o grupo e fere a segurança emocional da criança.",
    "details": [
      "Abaixe-se na altura dos olhos da criança para falar com calma, firmeza e afeto.",
      "O grito não educa: gera medo, reatividade e amplia a agitação em sala de aula.",
      "Use sinais visuais, palmas ritmadas ou frases-chave combinadas para atrair a atenção da turma.",
      "Se sentir irritação, respire fundo, peça apoio a uma colega e retome a calma antes de agir."
    ],
    "tags": [
      "não gritar",
      "comunicação calma",
      "firmeza gentil",
      "voz baixa",
      "olhos nos olhos",
      "infração",
      "seção 40"
    ],
    "order": 40
  },
  {
    "id": "norma_41_nao_pegar_com_forca",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "41",
    "sectionNumber": "41",
    "sectionTitle": "Respeito ao Corpo",
    "title": "Respeito ao Espaço Corporal: Proibição de Pegar as Crianças com Força",
    "type": "proibicao",
    "summary": "Toque cuidadoso e respeitoso. Jamais conter a criança com aperto ou força desproporcional.",
    "details": [
      "Nunca aperte ombros, punhos, mãos ou tronco da criança para forçar obediência.",
      "O toque deve ser acolhedor, seguro e protetor, sem causar desconforto ou marcas na pele.",
      "Em momentos de choro ou crise, ofereça colo com ternura e pergunte se a criança deseja um abraço.",
      "Contenções bruscas configuram desvio grave de conduta repudiado pelo colégio."
    ],
    "tags": [
      "não pegar com força",
      "toque respeitoso",
      "corpo",
      "integridade",
      "afeto",
      "proibição",
      "seção 41"
    ],
    "order": 41
  },
  {
    "id": "norma_42_nao_puxar_bracos",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "42",
    "sectionNumber": "42",
    "sectionTitle": "Integridade Física",
    "title": "Abordagem Cuidadosa: Proibição de Puxar as Crianças pelos Braços",
    "type": "proibicao",
    "summary": "Risco grave de pronação dolorosa no cotovelo. Conduza pela mão de forma suave ou caminhe lado a lado.",
    "details": [
      "Puxar a criança pelo braço pode causar luxações e lesões ortopédicas severas (pronação dolorosa).",
      "Segure na mão da criança com gentileza ou coloque a mão espalmada suavemente nas costas para direcioná-la.",
      "Se a criança empacar ou deitar no chão, agache-se, converse pacientemente e espere-a se levantar.",
      "Estimule a criança a caminhar por vontade própria através de brincadeiras e desafios positivos."
    ],
    "tags": [
      "não puxar braço",
      "pronação dolorosa",
      "mãozinha",
      "gentileza",
      "ortopedia",
      "proibição",
      "seção 42"
    ],
    "order": 42
  },
  {
    "id": "norma_43_seguranca_psicologica",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "43",
    "sectionNumber": "43",
    "sectionTitle": "Segurança Psicológica",
    "title": "Segurança Psicológica: Empatia, Afeto e Proibição de Aspereza",
    "type": "diretriz",
    "summary": "Acolher o erro como parte do aprendizado, banir ironias, comparações pejorativas e sarcasmo.",
    "details": [
      "Nunca ridicularize, menospreze ou faça comparações entre irmãos ou colegas de turma.",
      "Elimine expressões de aspereza, caras feias, bufadas ou desdém diante das perguntas dos alunos.",
      "Valide sentimentos: 'Eu vejo que você está chateado, vamos conversar sobre o que aconteceu?'.",
      "Um ambiente com segurança psicológica encoraja a curiosidade, a criatividade e a autoestima infantil."
    ],
    "tags": [
      "segurança psicológica",
      "empatia",
      "sem aspereza",
      "sem ironia",
      "autoestima",
      "afeto",
      "seção 43"
    ],
    "order": 43
  },
  {
    "id": "norma_44_paciencia_ritmos",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "44",
    "sectionNumber": "44",
    "sectionTitle": "Ritmos Individuais",
    "title": "Paciência Pedagógica e Respeito aos Diferentes Ritmos de Aprendizagem",
    "type": "recomendado",
    "summary": "Cada criança tem seu tempo para comer, calçar o tênis, guardar o material e compreender a lição.",
    "details": [
      "Não apresse a criança dizendo: 'Todo mundo já terminou, só falta você!'. Isso gera angústia.",
      "Ofereça apoio paciente para o desenvolvimento da autonomia (amarrar sapatos, abotoar roupas).",
      "Respeite os dias em que a criança estiver mais cansada ou sensível por razões familiares.",
      "Celebre pequenas conquistas diárias reforçando o sentimento de capacidade de cada um."
    ],
    "tags": [
      "paciência",
      "ritmos",
      "tempo individual",
      "autonomia",
      "apoio",
      "desenvolvimento",
      "seção 44"
    ],
    "order": 44
  },
  {
    "id": "norma_45_motivacao_positiva",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "45",
    "sectionNumber": "45",
    "sectionTitle": "Motivação Positiva",
    "title": "Motivação Positiva e Comunicação de Expectativas sem Ameaças",
    "type": "recomendado",
    "summary": "Explicar o porquê das regras em vez de ameaçar com castigos, perda do recreio ou queixas aos pais.",
    "details": [
      "Diga o que a criança DEVE fazer em vez de focar apenas no que NÃO pode.",
      "Substitua: 'Se não guardar os brinquedos, não vai pro parque!' por: 'Assim que guardarmos os blocos, estaremos prontos pro parque!'.",
      "Não use a figura da Coordenação ou dos pais como ameaça punitiva para obter obediência.",
      "Reconheça condutas colaborativas e incentive os alunos a cuidarem do espaço comum."
    ],
    "tags": [
      "motivação positiva",
      "sem ameaças",
      "expectativas claras",
      "combinados",
      "cooperação",
      "seção 45"
    ],
    "order": 45
  },
  {
    "id": "norma_46_mediacao_conflitos",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "46",
    "sectionNumber": "46",
    "sectionTitle": "Resolução de Conflitos",
    "title": "Protocolo Oficial de Mediação Construtiva de Conflitos em 3 Passos",
    "type": "diretriz",
    "summary": "Passo 1: Acalmar e respirar; Passo 2: Escutar as duas partes; Passo 3: Construir um acordo juntos.",
    "details": [
      "Passo 1: Separar os envolvidos com serenidade, abaixar-se e ajudá-los a respirar e retomar a calma.",
      "Passo 2: Dar voz a cada criança sem interrupções: 'O que você sentiu? O que aconteceu?'.",
      "Passo 3: Convidar as partes a pensar na reparação: 'Como vocês podem resolver isso juntos agora?'.",
      "Promover a empatia ensinando o pedido de desculpas genuíno e o compromisso com o bem-estar do colega."
    ],
    "tags": [
      "mediação de conflitos",
      "3 passos",
      "resolução pacífica",
      "escuta ativa",
      "empatia",
      "acordo",
      "seção 46"
    ],
    "order": 46
  },
  {
    "id": "norma_47_cuidados_bebes",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "47",
    "sectionNumber": "47",
    "sectionTitle": "Berçário e Bebês",
    "title": "Higiene e Cuidados Específicos com Bebês (Mini Maternal e Maternal)",
    "type": "alerta",
    "summary": "Alimentação fracionada, higienização rigorosa de mamadeiras, chupetas e brinquedos mordedores.",
    "details": [
      "Esterilizar mamadeiras e bicos diariamente com água fervente e armazená-los identificados.",
      "Brinquedos que vão à boca dos bebês devem ser higienizados com álcool 70% ou sabão neutro entre turnos.",
      "Não deixar bebês sozinhos em berços, cadeirões de alimentação ou trocadores em hipótese alguma.",
      "Registrar no aplicativo e no caderno de rotina a quantidade de leite e papinhas ingeridas."
    ],
    "tags": [
      "bebês",
      "mini maternal",
      "maternal",
      "mamadeiras",
      "chupeta",
      "esterilização",
      "seção 47"
    ],
    "order": 47
  },
  {
    "id": "norma_48_troca_fraldas",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "48",
    "sectionNumber": "48",
    "sectionTitle": "Fraldário",
    "title": "Fraldário: Troca de Fraldas e Desinfecção de Trocadores e Materiais",
    "type": "alerta",
    "summary": "Uso obrigatório de luvas descartáveis, papel toalha no trocador e desinfecção a cada troca.",
    "details": [
      "Calçar luvas descartáveis novas para cada criança antes de iniciar a higienização íntima.",
      "Forrar o trocador com papel toalha descartável e desinfetar a superfície com álcool 70% após o uso.",
      "Usar pomada contra assaduras apenas quando expressamente autorizado pelos pais.",
      "Descartar fraldas sujas em lixeira acionada por pedal com tampa vedada."
    ],
    "tags": [
      "fraldas",
      "trocador",
      "luvas",
      "fraldário",
      "álcool 70",
      "higiene íntima",
      "seção 48"
    ],
    "order": 48
  },
  {
    "id": "norma_49_higienizacao_maos",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "49",
    "sectionNumber": "49",
    "sectionTitle": "Lavagem das Mãos",
    "title": "Higienização das Mãos das Crianças e Educadoras em Momentos-Chave",
    "type": "diretriz",
    "summary": "Lavar as mãos antes de comer, após usar o banheiro, após o parque e ao entrar na sala de aula.",
    "details": [
      "Orientar a técnica correta de lavagem: água, sabão, esfregar palmas, dorso e entre os dedos por 20 segundos.",
      "Secar com papel toalha descartável sem desperdício de papel.",
      "As educadoras devem lavar as mãos sempre antes de manipular refeições e após auxiliar em sanitários.",
      "Disponibilizar dispenser de álcool em gel em locais fora do alcance de bebês para segurança."
    ],
    "tags": [
      "lavagem das mãos",
      "higienização",
      "sabão",
      "prevenção",
      "vírus",
      "saúde",
      "seção 49"
    ],
    "order": 49
  },
  {
    "id": "norma_50_hidratacao_termicos",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "50",
    "sectionNumber": "50",
    "sectionTitle": "Clima e Hidratação",
    "title": "Cuidados Térmicos, Hidratação Constante e Protetor Solar",
    "type": "recomendado",
    "summary": "Incentivo à ingestão de água, aplicação de protetor solar e recolhimento em dias de calor ou frio extremo.",
    "details": [
      "Oferecer água às crianças repetidas vezes ao dia, especialmente após brincadeiras ativas e no parque.",
      "Aplicar protetor solar nas crianças com autorização das famílias antes das atividades ao ar livre.",
      "Adequar o vestuário ao clima: colocar agasalhos no vento/frio e retirar excesso de roupas no calor.",
      "Em dias de temperatura superior a 32°C ou chuva intensa, transferir as oficinas para áreas cobertas."
    ],
    "tags": [
      "hidratação",
      "água",
      "protetor solar",
      "calor",
      "frio",
      "clima",
      "cuidados térmicos",
      "seção 50"
    ],
    "order": 50
  },
  {
    "id": "norma_51_febre_mal_estar_atestados",
    "moduleId": "guia_socioemocional",
    "moduleTitle": "Módulo 4: Guia Socioemocional e Abordagem Sensível",
    "section": "51",
    "sectionNumber": "51",
    "sectionTitle": "Sintomas Febris e Atestados",
    "title": "Protocolo em Casos de Sintomas Febris, Afastamento Temporário e Atestados Médicos",
    "type": "alerta",
    "summary": "Aferição de temperatura (37,8°C), isolamento acolhedor na enfermaria, contato com pais e atestado médico de retorno.",
    "details": [
      "Diante de prostração, choro sem motivo aparente ou calor excessivo, aferir a temperatura com termômetro digital.",
      "Constatada temperatura igual ou superior a 37,8°C, conduzir a criança à enfermaria para repouso acolhedor.",
      "A Coordenação ou Enfermaria comunicará imediatamente a família para retirada do aluno.",
      "O retorno escolar após doenças infectocontagiosas exige apresentação obrigatória de atestado médico de alta."
    ],
    "tags": [
      "febre",
      "temperatura",
      "enfermaria",
      "isolamento",
      "atestado médico",
      "retorno",
      "saúde",
      "seção 51"
    ],
    "order": 51
  }
];

export const INITIAL_MANUAL_NORMAS: NormaDataRecord[] = NORMAS_DATA;

/**
 * Utilitários de Busca e Indexação Rápida
 */
export function getNormBySection(sectionNumber: string | number): NormaDataRecord | undefined {
  const clean = String(sectionNumber).trim().replace(/^seção\s+/i, '');
  return NORMAS_DATA.find((n) => n.section === clean || n.sectionNumber === clean);
}

export function getNormById(id: string): NormaDataRecord | undefined {
  return NORMAS_DATA.find((n) => n.id === id);
}

export const MODULES_METADATA_4 = [
  { id: 'modulo_1', moduleId: 'rotina_operacional', title: 'Módulo 1: Rotina Operacional', sections: 'Seções 1 a 16', range: [1, 16] },
  { id: 'modulo_2', moduleId: 'seguranca_cuidados', title: 'Módulo 2: Segurança, Espaços, Academia e Transporte', sections: 'Seções 17 a 27', range: [17, 27] },
  { id: 'modulo_3', moduleId: 'postura_fardamento', title: 'Módulo 3: Postura, Fardamento e Proibições', sections: 'Seções 28 a 38', range: [28, 38] },
  { id: 'modulo_4', moduleId: 'guia_socioemocional', title: 'Módulo 4: Guia Socioemocional e Abordagem Sensível', sections: 'Seções 39 a 51', range: [39, 51] },
];

export const MODULES_METADATA_6 = MODULES_METADATA_4;
