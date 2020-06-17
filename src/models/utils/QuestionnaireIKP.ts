import {Questionnaire, QuestionType} from './QuestionTypes';

/**
 * Questionnaire IKP
 */
const QuestionnaireIKP: Questionnaire = {
    identifier: 'IKP',
    item: [
        {
            questionIdentifier: 'IKP1',
            question:
                'Sind, waren oder sollen Sie aufgrund einer Positivtestung zur SARS-CoV-2-Infektion in Quarantäne oder Isolation im Krankenhaus?',
            questionType: QuestionType.Choice,
            answerValue: [
                'Ja, ich bin aktuell noch in Quarantäne',
                'Ja, ich gehe in Quarantäne',
                'Nein, ich wurde aus der Quarantäne oder Isolation im Krankenhaus entlassen',
                'Nein, ich war nie aufgrund der Infektion in Quarantäne'
            ]
        },
        {
            questionIdentifier: 'IKP1.1',
            question: 'Wann wurden Sie aus der Quarantäne oder Isolation im Krankenhaus entlassen?',
            questionType: QuestionType.Date,
            enableWhen: [
                {
                    question: 'IKP1',
                    operator: '=',
                    answer:
                        'Nein, ich wurde aus der Quarantäne oder Isolation im Krankenhaus entlassen'
                }
            ]
        },
        {
            questionIdentifier: 'IKP2',
            question:
                'Ist Ihre aktuelle Krebstherapie aufgrund der SARS-CoV-2-Infektion unterbrochen?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', ' Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKP3',
            question: 'Werden Sie aktuell aufgrund einer Krebserkrankung behandelt?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKP3.1',
            question: '',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKP3', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKP3.1.1',
                    question: 'Wie ist Ihr Gewicht in kg?',
                    questionType: QuestionType.String,
                    regEx: '^([0-9]|[1-8][0-9]|9[0-9]|1[0-9]{2}|200)$',
                    enableWhen: [{question: 'IKP3.1.2', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'IKP3.1.2',
                    question: 'Wie ist Ihr Gewicht in kg?',
                    answerValue: ['Weiß nicht'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'IKP3.2',
            question:
                'Sind bereits Nachbarorgane oder entfernte Organe von Ihrer Krebserkrankung betroffen?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein, noch auf das Ursprungsorgan beschränkt', 'Weiß nicht'],
            enableWhen: [{question: 'IKP3', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'IKP3.3',
            question:
                'Bekommen Sie eine Strahlentherapie des Brustkorbs oder der Lunge (vollständig oder teilweise)?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht'],
            enableWhen: [{question: 'IKP3', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'IKP3.4',
            question:
                'Sind Sie gehfähig, aber nicht arbeitsfähig, können mehr als die Hälfte Ihrer Wachzeit aufstehen oder geht es Ihnen sogar besser und Sie können noch mehr selbst erledigen?',
            questionType: QuestionType.Boolean,
            enableWhen: [{question: 'IKP3', operator: '!=', answer: 'Nein'}]
        },
        {
            questionIdentifier: 'IKP4',
            question:
                'Wurde seit Ihrer Beantwortung des letzten Fragebogens eine neue Krebstherapie begonnen/gewechselt?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKP4.1',
            question: '',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKP4', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKP4.1.1',
                    question:
                        'Die wievielte Krebstherapie zu Ihrer aktuellen Krebserkrankung ist dies?',
                    questionType: QuestionType.String,
                    regEx: '^([0-9]|[1-8][0-9]|9[0-9]|100)$',
                    enableWhen: [{question: 'IKP4.1.2', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'IKP4.1.2',
                    question:
                        'Die wievielte Krebstherapie zu Ihrer aktuellen Krebserkrankung ist dies?',
                    questionType: QuestionType.OpenChoice,
                    answerValue: ['weiß nicht']
                }
            ]
        },
        {
            questionIdentifier: 'IKP4.2',
            question:
                'Welche der folgenden Therapien bekommen Sie nun aufgrund Ihrer Krebserkrankung? (Mehrfachnennungen möglich)',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKP4', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKP4.2.1',
                    question: 'Anti-Hormonelle Therapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.2',
                    question: 'Chemotherapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.3',
                    question: 'Checkpoint-Inhibitor Therapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.4',
                    question:
                        'Anti-HER2/neu-Rezeotor gerichtete Therapie (z.B. Herceptin®, Kanjinti®, Perjeta®)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.5',
                    question: 'Eine andere Antikörper-Therapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.6',
                    question: 'CDK4/6-Inhibitor Therapie (z.B. Ibrance®, Kisquali®, Verzenios®)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.7',
                    question: 'mTOR-Inhibitor Therapie (z.B. Everolimus/Rapamycin, Sirolimus)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.8',
                    question: 'Strahlentherapie des Brustkorbs/Lunge (vollständig oder teilweise)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.9',
                    question: 'Stammzelltransplantationen (autolog/allogen)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.10',
                    question: 'Knochenmarktransplantation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.11',
                    question: 'Andere Zielgerichtete Therapie (bei genetischer Mutation)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.12',
                    question: 'Operative Entfernung',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP4.2.13',
                    question: 'Wann wurde diese durchgeführt?',
                    questionType: QuestionType.Date,
                    enableWhen: [{question: 'IKP4.2.12', operator: '=', answer: 'Ja'}]
                }
            ]
        },
        {
            questionIdentifier: 'IKP4.3',
            question: '',
            enableWhen: [{question: 'IKP4', operator: '=', answer: 'Ja'}],
            questionType: QuestionType.Group,
            item: [
                {
                    questionIdentifier: 'IKP4.3.1',
                    question: 'Wie lautet Ihre Krebsmedikation?',
                    enableWhen: [{question: 'IKP4.3.2', operator: '!exists', answer: ''}],
                    questionType: QuestionType.String
                },
                {
                    questionIdentifier: 'IKP4.3.2',
                    question: 'Wie lautet Ihre Krebsmedikation?',
                    answerValue: ['Weiß nicht'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'IKP5',
            question: 'Leiden Sie aktuell unter Symptomen aufgrund der SARS-CoV-2-Infektion?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKP5.1',
            question: 'Unter welchen der folgenden Symptomen leiden Sie?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKP5', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKP5.1.1',
                    question: 'Fieber (über 38,5°C)',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.2',
                    question: 'Kopf- und Gliederschmerzen',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.3',
                    question: 'Muskel- und Gelenkschmerzen',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.4',
                    question: 'Kurzatmigkeit/Atemlosigkeit',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.5',
                    question: 'Trockener Husten',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.6',
                    question: 'Husten (mit Auswurf)',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.7',
                    question: 'Geruchs- bzw. Geschmacksstörungen',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.8',
                    question: 'Übelkeit',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.9',
                    question: 'Erbrechen',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.10',
                    question: 'Bauchschmerzen',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.11',
                    question: 'Durchfall',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.12',
                    question: 'Müdigkeit',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.13',
                    question: 'Bewusstlosigkeit oder Verwirrtheit',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'IKP5.1.14',
                    question: 'Andere Symptome?',
                    questionType: QuestionType.String
                }
            ]
        },
        {
            questionIdentifier: 'IKP6',
            question:
                'Sind Sie aktuell aufgrund der SARS-CoV-2-Infektion in stationärer Behandlung?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKP6.1',
            question: 'Auf welcher Art von Station werden Sie behandelt?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKP6', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKP6.1.1',
                    question: 'Intensivstation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP6.1.2',
                    question: 'Isolierstation/Infektionsstation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP6.1.3',
                    question: 'Sonstige',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'IKP6.1.4', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'IKP6.1.4',
                    question: 'Sonstige',
                    answerValue: ['Nein'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'IKP7',
            question: 'Erhalten Sie aktuell aufgrund der SARS-CoV-2-Infektion eine Behandlung?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'IKP7.1',
            question: 'Welche Art von Behandlung erhalten Sie?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKP7', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKP7.1.1',
                    question: 'Bekommen Sie zusätzlich Sauerstoff? ',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP7.1.2',
                    question:
                        'Wird Ihr Flüssigkeitshaushalt z.B. durch eine Infusion ausgeglichen?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP7.1.3',
                    question: 'Wurde bei Ihnen eine Lungenentzündung (Pneumonie) diagnostiziert?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP7.1.4',
                    question: 'Erhalten Sie Antibiotika?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP7.1.5',
                    question: 'Werden/wurden Sie mit Quensly/Hydroxychloroquin behandelt?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP7.1.6',
                    question: 'Werden/wurden Sie mit Remdesivier behandelt?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP7.1.7',
                    question: 'Wurden Sie künstlich beatmet (Intubation)?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP6.1.7',
                    question:
                        'Wurde bei Ihnen eine Beatmung mit einer „Künstliche Lunge/Lungenmaschine (extrakorporaler Membranoxygenierung = ECMO) durchgeführt?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'IKP7.1.9',
                    question:
                        'Nehmen Sie sich bitte noch die Zeit, in folgendes Feld gegebenenfalls auch alle anderen Behandlungen aufgrund Ihrer SARS-CoV-2 Infektion einzutragen: ',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'IKP7.1.10', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'IKP7.1.10',
                    question:
                        'Nehmen Sie sich bitte noch die Zeit, in folgendes Feld gegebenenfalls auch alle anderen Behandlungen aufgrund Ihrer SARS-CoV-2 Infektion einzutragen: ',
                    answerValue: [
                        'Ich habe keine weiteren Behandlungen aufgrund meiner SARS-CoV-2-Infektion erhalten'
                    ],
                    questionType: QuestionType.OpenChoice
                },
                {
                    questionIdentifier: 'IKP7.1.11',
                    question: 'Nehmen Sie an einer Studie zu einer (neuen) COVID-Therapie teil? ',
                    answerValue: ['Ja', 'Nein', 'Weiß nicht'],
                    questionType: QuestionType.Choice
                }
            ]
        },

        {
            questionIdentifier: 'IKP7.1.11.1',
            question: '',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'IKP7.1.11', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'IKP7.1.11.1.1',
                    question: 'Welche COVID-Therapie/Medikament erhalten Sie in dieser?',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'IKP7.1.11.1.2', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'IKP7.1.11.1.2',
                    question: 'Welche COVID-Therapie/Medikament erhalten Sie in dieser?',
                    answerValue: ['weiß nicht'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'IKP8',
            question:
                'Sind Wie von Ihren Familienmitgliedern oder engsten Angehörigen getrennt, um eine Ansteckung zu verhindern?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        }
    ]
};

export default QuestionnaireIKP;
