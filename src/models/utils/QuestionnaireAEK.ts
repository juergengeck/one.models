import {Questionnaire, QuestionType} from './QuestionTypes';

/**
 * Questionnaire AEK
 */
let QuestionnaireAEK: Questionnaire = {
    identifier: 'AEK',
    item: [
        {
            questionIdentifier: 'AEK1.1',
            question: 'In welchem Jahr sind Sie geboren?',
            questionType: QuestionType.String,
            regEx: '^(19[0-8][0-9]|199[0-9]|20[01][0-9]|2020)$'
        },
        {
            questionIdentifier: 'AEK1.2',
            question: 'Welches Geschlecht haben Sie?',
            questionType: QuestionType.Choice,
            answerValue: ['weiblich', 'männlich', 'divers']
        },
        {
            questionIdentifier: 'AEK1.3',
            question: 'Sind Sie jemals positiv auf eine SARS-CoV2-Infektion getestet worden?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein']
        },
        {
            questionIdentifier: 'AEK1.3.1',
            question: 'Wie sind Sie positiv auf eine SARS-CoV-2-Infektion getestet worden?',
            questionType: QuestionType.Choice,
            answerValue: ['Rachen- oder Nasenabstrich', 'Blut-Test'],
            enableWhen: [{question: 'AEK1.3', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'AEK1.3.2',
            question: 'Wann wurden Sie auf eine SARS-CoV-2 Infektion getestet?',
            questionType: QuestionType.Date,
            enableWhen: [{question: 'AEK1.3', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'AEK1.4',
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
            questionIdentifier: 'AEK1.4.1',
            question: 'Wann wurden Sie aus der Quarantäne oder Isolation im Krankenhaus entlassen?',
            questionType: QuestionType.Date,
            enableWhen: [
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer:
                        'Nein, ich wurde aus der Quarantäne oder Isolation im Krankenhaus entlassen'
                }
            ]
        },
        {
            questionIdentifier: 'AEK2',
            question: 'Ist bei Ihnen jemals eine Krebserkrankung diagnostiziert worden?',
            questionType: QuestionType.Boolean
        },
        {
            questionIdentifier: 'AEK3',
            question: 'Welche Krebserkrankung ist bei Ihnen diagnostiziert worden?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK2', operator: '=', answer: 'Ja'}],
            item: [
                {
                    questionIdentifier: 'AEK3.1',
                    question: 'Darm',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.2',
                    question: 'Brust',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.3',
                    question: 'Lunge',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.4',
                    question: 'Prostata',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.5',
                    question: 'Haut (Malignes Melanom)',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.6',
                    question: 'Harnblase',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.7',
                    question: 'Lymphom (Hodgkin, Non-Hodgkin, multiples Myelom)',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.8',
                    question: 'Gebärmutterkörper',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.9',
                    question: 'Mundhöhle und Rachen',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.10',
                    question: 'Magen',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.11',
                    question: 'Niere',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.12',
                    question: 'Leukämien',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK3.13',
                    question: 'Sonstige',
                    questionType: QuestionType.String
                }
            ]
        },
        {
            questionIdentifier: 'AEK4',
            question:
                'Sind bereits Nachbarorgane oder entferntere Organe von Ihrer Krebserkrankung betroffen? ',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein, noch auf das Ursprungsorgan beschränkt', 'Weiß nicht'],
            enableWhen: [
                {question: 'AEK3.7', operator: 'exists', answer: ''},
                {question: 'AEK3.12', operator: 'exists', answer: ''}
            ]
        },
        {
            questionIdentifier: 'AEK5',
            question: 'In welchem Jahr ist Ihre Krebserkrankung diagnostiziert worden?',
            questionType: QuestionType.String,
            regEx: '^(19[0-8][0-9]|199[0-9]|20[01][0-9]|2020)$',
            enableWhen: [{question: 'AEK2', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'AEK6',
            question: 'Erhalten Sie aktuell eine Krebstherapie?',
            questionType: QuestionType.Choice,
            enableWhen: [{question: 'AEK2', operator: '=', answer: 'Ja'}],
            answerValue: ['Ja', 'Nein']
        },
        {
            questionIdentifier: 'AEK6.1',
            question:
                'Welche der folgenden Therapien erhalten Sie aufgrund Ihrer Krebserkrankung? (Mehrfachnennungen möglich)',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK6', operator: '=', answer: 'Ja'}],
            item: [
                {
                    questionIdentifier: 'AEK6.1.1',
                    question: 'Anti-Hormonelle Therapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.2',
                    question: 'Chemotherapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.3',
                    question: 'Checkpoint-Inhibitor Therapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.4',
                    question:
                        'Anti-HER2/neu-Rezeptor gerichtete Therapie (z.B. Herceptin®, Kanjinti®, Perjeta®)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.5',
                    question: 'Eine andere Antikörper-Therapie',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.6',
                    question: 'CDK4/6-Inhibitor Therapie (z.B. Ibrance®, Kisquali®, Verzenios®)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.7',
                    question: 'mTOR-Inhibitor Therapie (z.B. Everolimus/Rapamycin, Sirolimus)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.8',
                    question: 'Strahlentherapie des Brustkorbs/Lunge (vollständig oder teilweise)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.9',
                    question: 'Stammzelltransplantationen (autolog/allogen)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.10',
                    question: 'Knochenmarktransplantation',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.11',
                    question: 'Andere Zielgerichtete Therapie (bei genetischer Mutation)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.12',
                    question: 'Hatten Sie eine operative Entfernung?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK6.1.13',
                    question: 'Wann wurde diese durchgeführt?',
                    questionType: QuestionType.Date,
                    enableWhen: [{question: 'AEK6.1.12', operator: '=', answer: 'Ja'}]
                }
            ]
        },
        {
            questionIdentifier: 'AEK6.2',
            question: 'Wie lautet Ihre Krebsmedikation? (Mehrfachnennungen möglich)',
            enableWhen: [{question: 'AEK6', operator: '=', answer: 'Ja'}],
            questionType: QuestionType.String
        },
        {
            questionIdentifier: 'AEK6.3',
            question: 'Die wievielte Krebstherapie zu Ihrer aktuellen Krebserkrankung ist dies?',
            questionType: QuestionType.String,
            regEx: '^([0-9]|[1-8][0-9]|9[0-9]|100)$',
            enableWhen: [{question: 'AEK6', operator: '=', answer: 'Ja'}]
        },
        {
            questionIdentifier: 'AEK6.4',
            question:
                'Wurde Ihre aktuelle Krebstherapie aufgrund der SARS-CoV-2-Infektion unterbrochen werden?',
            questionType: QuestionType.Choice,
            enableWhen: [{question: 'AEK6', operator: '=', answer: 'Ja'}],
            answerValue: [
                'Ja, die Krebstherapie ist aktuell unterbrochen',
                'Ja, die Therapie wurde unterbrochen und wieder aufgenommen',
                ' Nein',
                ' Weiß nicht'
            ]
        },
        {
            questionIdentifier: 'AEK6.4.1',
            question: 'Seit wann ist Ihre Therapie unterbrochen?',
            questionType: QuestionType.Date,
            enableWhen: [
                {
                    question: 'AEK6.4',
                    operator: '=',
                    answer: 'Ja, die Krebstherapie ist aktuell unterbrochen'
                }
            ]
        },
        {
            questionIdentifier: 'AEK6.4.2',
            question: 'Über welchen Zeitraum wird Ihre Therapie unterbrochen? ',
            questionType: QuestionType.Group,
            enableWhen: [
                {
                    question: 'AEK6.4',
                    operator: '=',
                    answer: 'Ja, die Therapie wurde unterbrochen und wieder aufgenommen'
                }
            ],
            item: [
                {
                    questionIdentifier: 'AEK6.4.2.1',
                    question: 'Von',
                    questionType: QuestionType.Date
                },
                {
                    questionIdentifier: 'AEK6.4.2.2',
                    question: 'Bis',
                    questionType: QuestionType.Date
                }
            ]
        },
        {
            questionIdentifier: 'AEK7',
            question:
                'Sind Sie in den letzten 5 Jahren mindestens 1 Mal gegen Influenza geimpft worden?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'AEK8',
            question: 'Sind Sie gegen Pneumokokken geimpft worden? (Mehrfachnennungen möglich)',
            questionType: QuestionType.Group,
            item: [
                {
                    questionIdentifier: 'AEK8.1',
                    question: 'Ja, vor langer Zeit',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK8.2',
                    question: 'Ja, kürzlich',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK8.3',
                    question: 'Nein',
                    questionType: QuestionType.OpenChoiceGroup
                }
            ]
        },
        {
            questionIdentifier: 'AEK9',
            question:
                'Haben Sie neben der Krebserkrankung und der SARS-CoV-2-Infektion andere Erkrankungen oder sind Ihnen Vorerkrankungen bekannt?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'AEK9.1',
            question: 'Welche der folgenden (Vor-)erkrankungen?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK9', operator: '=', answer: 'Ja'}],
            item: [
                {
                    questionIdentifier: 'AEK9.1.1',
                    question:
                        'Herz-Kreislauf-Erkrankungen (z.B. Herzschwäche, Herzklappenfehler, u.a.)?  *Bluthochdruck wird extra gefragt',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK9.1.2',
                    question: 'Welche Herz-Kreislauf-Erkrankungen?',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'AEK9.1.1', operator: '=', answer: 'Ja'}]
                },
                {
                    questionIdentifier: 'AEK9.1.3',
                    question: 'Bluthochdruck (Hypertonie)',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK9.1.4',
                    question: 'Chronische Atemwegs-/Lungenerkrankungen',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK9.1.5',
                    question: 'Welche Atemwegs-/Lungenerkrankungen?',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'AEK9.1.4', operator: '=', answer: 'Ja'}]
                },
                {
                    questionIdentifier: 'AEK9.1.6',
                    question: 'Diabetes Typ1 oder Typ 2',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                }
            ]
        },
        {
            questionIdentifier: 'AEK9.1.7',
            question: '',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK9', operator: '=', answer: 'Ja'}],
            item: [
                {
                    questionIdentifier: 'AEK9.1.7.1',
                    question:
                        'Nehmen Sie sich bitte noch die Zeit, in folgendes Feld auch alle anderen Krankheiten einzutragen:',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'AEK9.1.7.2', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'AEK9.1.7.2',
                    question:
                        'Nehmen Sie sich bitte noch die Zeit, in folgendes Feld auch alle anderen Krankheiten einzutragen:',
                    answerValue: ['Ich habe keine weiteren Krankheiten'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'AEK10',
            question: 'Haben Sie jemals Zigaretten geraucht?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nichtraucher/in', 'ehemalige/r Raucher/in']
        },
        {
            questionIdentifier: 'AEK11',
            question:
                'Bisher gibt es noch keine Hinweise auf einen Zusammenhang zwischen der Haltung von Haustieren im eigenen Haushalt und der Übertragung von SARS-CoV-2 auf den Menschen oder umgekehrt. Dennoch bitten wir Sie folgende Frage zu beantworten. Haben Sie Haustiere, die mit Ihnen im Haushalt leben?  ',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein']
        },
        {
            questionIdentifier: 'AEK11.1',
            question: 'Welche Haustiere? (Mehrfachnennung möglich)',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK11', operator: '=', answer: 'Ja'}],
            item: [
                {
                    questionIdentifier: 'AEK11.1.1',
                    question: 'Hund',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK11.1.2',
                    question: 'Katze',
                    questionType: QuestionType.OpenChoiceGroup
                },
                {
                    questionIdentifier: 'AEK11.1.3',
                    question: 'Sonstige',
                    questionType: QuestionType.String
                }
            ]
        },
        {
            questionIdentifier: 'AEK12',
            question: '',
            questionType: QuestionType.Group,
            enableWhen: [
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer:
                        'Nein, ich wurde aus der Quarantäne oder Isolation im Krankenhaus entlassen'
                },
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer: 'Nein, ich war nie aufgrund der Infektion in Quarantäne'
                }
            ],
            item: [
                {
                    questionIdentifier: 'AEK12.1',
                    question:
                        'Erinnern Sie sich bitte, wie lange Sie Symptome aufgrund der SARS-CoV-2-Infektion hatten. (Angabe bitte in Tagen)',
                    questionType: QuestionType.String,
                    enableWhen: [
                        {question: 'AEK12.2', operator: 'exists', answer: ''},
                        {question: 'AEK12.3', operator: 'exists', answer: ''}
                    ]
                },
                {
                    questionIdentifier: 'AEK12.2',
                    question:
                        'Erinnern Sie sich bitte, wie lange Sie Symptome aufgrund der SARS-CoV-2-Infektion hatten. (Angabe bitte in Tagen)',
                    answerValue: ['Ich hatte keine Symptome'],
                    questionType: QuestionType.OpenChoice
                },
                {
                    questionIdentifier: 'AEK12.3',
                    question:
                        'Erinnern Sie sich bitte, wie lange Sie Symptome aufgrund der SARS-CoV-2-Infektion hatten. (Angabe bitte in Tagen)',
                    answerValue: ['Ich weiß es nicht mehr'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'AEK13',
            question:
                'Waren Sie aufgrund Ihrer zurückliegenden SARS-CoV-2-Infektion in stationärer Behandlung?',
            questionType: QuestionType.Choice,
            answerValue: ['Ja', 'Nein', 'Weiß nicht'],
            enableWhen: [
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer:
                        'Nein, ich wurde aus der Quarantäne oder Isolation im Krankenhaus entlassen'
                },
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer: 'Nein, ich war nie aufgrund der Infektion in Quarantäne'
                }
            ]
        },
        {
            questionIdentifier: 'AEK13.1',
            question: 'Auf welcher Art von Station wurden Sie behandelt? (Mehrfachnennung möglich)',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK13', operator: '=', answer: 'Ja'}],
            item: [
                {
                    questionIdentifier: 'AEK13.1.1',
                    question: 'Intensivstation?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK13.1.2',
                    question: 'Isolierstation/Infektionsstation?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK13.1.3',
                    question: 'Sonstige',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'AEK13.1.4', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'AEK13.1.4',
                    question: 'Sonstige',
                    answerValue: ['Auf keiner Station'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'AEK14',
            question: 'Erhielten Sie aufgrund der SARS-CoV-2-Infektion eine Behandlung?',
            questionType: QuestionType.Choice,
            enableWhen: [
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer:
                        'Nein, ich wurde aus der Quarantäne oder Isolation im Krankenhaus entlassen'
                },
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer: 'Nein, ich war nie aufgrund der Infektion in Quarantäne'
                }
            ],
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        },
        {
            questionIdentifier: 'AEK14.1',
            question: 'Welche der folgenden Behandlungen haben Sie erhalten?',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK14', operator: '=', answer: 'Ja'}],
            item: [
                {
                    questionIdentifier: 'AEK14.1.1',
                    question: 'Bekamen Sie zusätzlich Sauerstoff? ',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.2',
                    question:
                        'Wurde Ihr Flüssigkeitshaushalt z.B. durch eine Infusion ausgeglichen?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.3',
                    question: 'Wurde bei Ihnen eine Lungenentzündung  (Pneumonie) diagnostiziert?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.4',
                    question: 'Erhielten Sie Antibiotika?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.5',
                    question: 'Wurden/werden Sie mit Quensly/Hydroxychloroquin behandelt?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.6',
                    question: 'Wurden Sie mit Remdesivir behandelt?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.7',
                    question: 'Wurden Sie künstlich beatmet (Intubation)?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.8',
                    question:
                        'Wurde bei Ihnen eine Beatmung mit einer Künstlichen Lunge/Lungenmaschine (extrakorporaler Membranoxygenierung = ECMO) durchgeführt?',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                },
                {
                    questionIdentifier: 'AEK14.1.9',
                    question:
                        'Nehmen Sie sich bitte noch die Zeit, in folgendes Feld gegebenenfalls auch alle anderen Behandlungen aufgrund Ihrer SARS-CoV-2 Infektion-einzutragen:',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'AEK14.1.13', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'AEK14.1.10',
                    question:
                        'Nehmen Sie sich bitte noch die Zeit, in folgendes Feld gegebenenfalls auch alle anderen Behandlungen aufgrund Ihrer SARS-CoV-2 Infektion-einzutragen:',
                    answerValue: ['Ich habe keine weiteren Behandlungen erhalten'],
                    questionType: QuestionType.OpenChoice
                },
                {
                    questionIdentifier: 'AEK14.1.11',
                    question:
                        'Haben Sie an einer Studie zu einer (neuen) COVID-Therapie Teilgenommen',
                    questionType: QuestionType.Choice,
                    answerValue: ['Ja', 'Nein', 'Weiß nicht']
                }
            ]
        },

        {
            questionIdentifier: 'AEK14.1.11.1',
            question: '',
            questionType: QuestionType.Group,
            enableWhen: [{question: 'AEK14.1.11', operator: '!=', answer: 'Nein'}],
            item: [
                {
                    questionIdentifier: 'AEK14.1.11.1.1',
                    question:
                        'Welche COVID-Therapie oder Medikamente haben Sie in dieser Studie erhalten?',
                    questionType: QuestionType.String,
                    enableWhen: [{question: 'AEK14.1.11.1.2', operator: '!exists', answer: ''}]
                },
                {
                    questionIdentifier: 'AEK14.1.11.1.2',
                    question:
                        'Welche COVID-Therapie oder Medikamente haben Sie in dieser Studie erhalten?',
                    answerValue: ['Weiß nicht'],
                    questionType: QuestionType.OpenChoice
                }
            ]
        },
        {
            questionIdentifier: 'AEK15',
            question: 'Wurden Sie von ihren Familienmitgliedern oder engsten Angehörigen getrennt?',
            questionType: QuestionType.Choice,
            enableWhen: [
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer:
                        'Nein, ich wurde aus der Quarantäne oder Isolation im Krankenhaus entlassen'
                },
                {
                    question: 'AEK1.4',
                    operator: '=',
                    answer: 'Nein, ich war nie aufgrund der Infektion in Quarantäne'
                }
            ],
            answerValue: ['Ja', 'Nein', 'Weiß nicht']
        }
    ]
};

export default QuestionnaireAEK;
