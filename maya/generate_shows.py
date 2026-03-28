#!/usr/bin/env python3
"""
Generate shows.json for the Unprofessional Variety Show website.
Extracts all show data from the Instagram export posts_1.json.
"""
import json
import os

# All 17 shows, newest first
shows = [
    {
        "title": "The Internet",
        "edition": 17,
        "date": "2026-02-15",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "Come surf the net.",
        "performers": [
            {
                "name": "Mike Albo",
                "instagram": "@albomike",
                "bio": "Mike Albo's latest book is Hologram Boyfriends: Sex, Love and Overconnection, just out through Macmillan Audio. His novels include Hornito, The Underminer: The Best Friend Who Casually Destroys Your Life, and the queer young adult romantasy Another Dimension of Us. He's performed across the USA, UK, and Canada. mikealbo.net"
            },
            {
                "name": "Li-Ming Hu",
                "instagram": "@outraged994",
                "bio": "Li-Ming Dynasty originally hails from Aotearoa/NZ and makes videos, performances and sculptures. She's worried she may have peaked in 2009 when she played a Power Ranger but hopes that one day she will reclaim her former glory."
            },
            {
                "name": "Libby Paloma",
                "instagram": "@libbys_arty_party",
                "bio": "Libby Paloma is a queercrip, Mexican-American interdisciplinary artist working in sculpture, installation, and performance. Embracing maximalist aesthetics, humor, and craft traditions, they are in the business of \"world-softening.\" Creating plush, embracable versions of the objects around us, Libby intervenes in dominant and oppressive structures by offering an alternative, softer, more joyous way of engaging with ourselves and others."
            },
            {
                "name": "Mac Waters",
                "instagram": "",
                "bio": "Mac Waters is a dynamic multimedia composer and improviser. Mac's research investigates the interplay between collective memory and sonic nostalgia, particularly in relation to virtual/extended realities, internet (sub)cultures, queerness, and digital medievalism. His diverse creative practice spans composing chamber music for leading contemporary ensembles, composing electroacoustic music for film and dance, performing as a vocalist and violist in interdisciplinary and multimedia performances, designing interactive Virtual & Extended Reality experiences, and recording and producing original song. Based in Vermont, Mac works as the Digital Technician Specialist for the Film & Media Studies and Studio Art departments at Dartmouth College."
            }
        ],
        "specialGuests": [
            {
                "name": "Michael aka Micro",
                "instagram": "",
                "bio": "Our cyber securities expert"
            }
        ],
        "accompaniment": "",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Costumes by @evvintagecollective styled by Maegan. Tech by Vandy @vanburgocollective. Door by @macauleydevun. Mics by @pigpenhaulin.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/18174652480372608.jpg",
        "isUpcoming": False,
        "description": "Come surf the net.",
        "recapImages": [
            "img/ig-posts/17885494398445928.jpg",
            "img/ig-posts/18110534539676044.jpg",
            "img/ig-posts/18099440605931580.jpg",
            "img/ig-posts/18003371114892767.jpg",
            "img/ig-posts/17933832492032152.jpg"
        ],
        "recapCaption": "Thank you to everyone who came and surfed the net with us at Unprofessional Variety Show: The Internet. A highlight was when audience members who were adults before our digital overlord shared things they miss: breakups while standing at a pay phone on the street. Ugh, so good."
    },
    {
        "title": "Vampires Resurrected",
        "edition": 16,
        "date": "2025-12-14",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "",
        "performers": [
            {
                "name": "Jack Rabbit Slims",
                "instagram": "@jackburlesque",
                "bio": "Jack Rabbit Slims is the New Jersey raised and Brooklyn based Afro Latina babe wreaking havoc on the city for the last 7 years one slow burn at a time! She is a triple water sign so around her you are always in the splash zone. Never forgetting to embrace the most important part of being sexy, the silly! Jack is known as the cult classic of burlesque."
            },
            {
                "name": "Kris Grey",
                "instagram": "@krisgreystudio",
                "bio": "Kris Grey is a gender queer creature of transmasculine experience. Tonight they will perform as Bat Boy, looking for love in all the dark places. Feast your eyes on the glow up of the millennia. Once a pariah, misrepresented by the tabloid press during his formative years. Decades of study has led scientists to diagnose his condition as falling under the trans umbrella; trans-species that is. Doing his best to fit into society's ridged human-centered beauty ideals after being mocked in the satire media of the 1990s, Bat Boy spent the past three decades seeking human-affirming medical care, all of which he has paid for out of pocket due to an exclusionary clause in the healthcare system barring insurance coverage for halfbreeds. Now he is palatable for the masses, single, and ready to mingle! Please welcome to the stage Bat Boy!"
            },
            {
                "name": "OZLEM",
                "instagram": "@liamlyonsshields",
                "bio": "OZLEM is an audiovisual pop project created by Brooklyn-based artist Liam Lyons-Shields, exploring themes of longing and yearning through synth infused ear-worm pop songs and high fashion visuals."
            }
        ],
        "specialGuests": [
            {
                "name": "Li-Ming Hu",
                "instagram": "@outraged994",
                "bio": ""
            },
            {
                "name": "Laura Westengard",
                "instagram": "@laurawestengard",
                "bio": ""
            },
            {
                "name": "Dylan Gong",
                "instagram": "@thedylangong",
                "bio": ""
            }
        ],
        "accompaniment": "Klovis Gaynor",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Sponsored by the Bad Review Fund. @macauleydevun on door, Lorenzo Triburgo on video documentation, @alafemmegaze on tech, Parkside tech the brilliant Jun, @libbys_arty_party on backup all things, @tata.loperasanchez on photo documentation.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/18366407008089307.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [
            "img/ig-posts/18552327799026523.jpg",
            "img/ig-posts/18107787688645364.jpg",
            "img/ig-posts/18065286365199072.jpg",
            "img/ig-posts/18109129144641737.jpg",
            "img/ig-posts/18102252757766393.jpg",
            "img/ig-posts/18081944714174384.jpg",
            "img/ig-posts/18079491761241963.jpg",
            "img/ig-posts/17952908783919049.jpg",
            "img/ig-posts/18355890979160582.jpg",
            "img/ig-posts/18098074579867430.jpg",
            "img/ig-posts/18116883988579461.jpg"
        ],
        "recapCaption": "Thank you to everyone who braved the ice to celebrate the season of the dark with us."
    },
    {
        "title": "BAD ADVICE!!!",
        "edition": 15,
        "date": "2025-09-21",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "Because we all need help",
        "performers": [
            {
                "name": "Bob Voyage",
                "instagram": "@FantasyGrandma",
                "bio": "Bob Voyage will be giving us travel tips! He is the creation of Francis. Francis is a writer / comedian / performance artist, creator of Fantasy Grandma & Y2K drag boyband Earls2Gearls, DAD, Happy To See You and now Bob Voyage. Their work has appeared at The New Museum, The Met, the Brooklyn Museum, Joe's Pub, Bushwig, and the Hollywood Improv and has been featured in NY Times, Motherboard, ARTFORUM, WSJ, and the Village Voice. They were a member of the NY Neo-Futurists from 2008-2018 and were nominated for a Drama Desk. Bob Voyage is a lost man in a large world."
            },
            {
                "name": "Cherie",
                "instagram": "@paulsoileau",
                "bio": "Cherie lives in New York City and hosts a monthly \"Revolutionary Sip n Paint Salon\" at her local bar, The Parkside Lounge, educating her attendees about revolutionary figures, alive or dead, who stood up to the system and made change in the world. She has worked as a hair salon technician at \"Vidal Shaboom....by Jerome\" as well as a personal injury lawyer within the law firm of \"Popper, Jape and Huh?\" She is also an undesignated member of the performance troupe \"SHABOOM!\"."
            },
            {
                "name": "Sebastian Ade",
                "instagram": "@sebastianxade",
                "bio": "Sebastian Ade creates music that flows straight from the soul - a Brooklyn storyteller who uses vocal looping and genre-fluid songwriting to forge deep connections. His distinctive, soulful tone has captivated audiences nationwide, weaving intimate tales that invite listeners into his authentic musical world."
            },
            {
                "name": "Shannon Sennott",
                "instagram": "@ssennott",
                "bio": "Shannon Sennott is an LGBTQAI sex educator, psychotherapist, and sex therapist, and founded the advocacy and education organization, Translate Gender, Inc. In her clinical practice, Shannon specializes in concerns related to gender, sexuality, disability and sexuality, HAES (health at every size), ENM, polyamory, BDSM/Kink, and alternative family structures. She co-wrote the book Sex Therapy with Erotically Marginalized Clients, and will join us at Unprofessional to give our audience advice live on stage."
            }
        ],
        "specialGuests": [
            {
                "name": "Heather Acs West Vagina",
                "instagram": "@heather_maria_acs",
                "bio": ""
            },
            {
                "name": "Shawn Escarciga",
                "instagram": "@missladysalad",
                "bio": ""
            },
            {
                "name": "Li-Ming Hu",
                "instagram": "@outraged994",
                "bio": ""
            },
            {
                "name": "Sarah Edmondson",
                "instagram": "@sarahedmondson",
                "bio": ""
            }
        ],
        "accompaniment": "Klovis Gaynor",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Stylists: Libby Paloma @libbys_arty_party, Erin Connolly @e.connolly123, HMac @hmacsauz. \"BADVICE\" Banner by @libbys_arty_party.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17932002821960776.jpg",
        "isUpcoming": False,
        "description": "Because we all need help",
        "recapImages": [
            "img/ig-posts/18129557578476841.jpg",
            "img/ig-posts/17937549350961354.jpg",
            "img/ig-posts/18532404010041281.jpg",
            "img/ig-posts/18109985164503637.jpg",
            "img/ig-posts/18346467259161478.jpg",
            "img/ig-posts/17939185974086424.jpg",
            "img/ig-posts/17973982010945729.jpg",
            "img/ig-posts/18078814144870948.jpg"
        ],
        "recapCaption": "Thank you to everyone who comes to Unprofessional Variety Show. The last show gave us some baaad baaad (and some super good) advice. But just remember, you're fiiiiiiiiiine."
    },
    {
        "title": "Summer Camp",
        "edition": 14,
        "date": "2025-05-18",
        "time": "8:00 PM",
        "doors": "7:30 PM",
        "theme": "",
        "performers": [
            {
                "name": "Dusty Childers",
                "instagram": "@duddylynn",
                "bio": "Dusty Childers is a multi-disciplinary artist and educator who has worn the chapeaus of director, producer, dramaturgist, costumer, and stylist. Dusty's body and body of work has graced the likes of The Guggenheim, St. Ann's, The Whitney, BAM, Parsons, Joe's Pub, Pratt, Sundance, SXSW, Signature Theater, Institute of Contemporary Art Philadelphia, Town Hall, Abrons Art Center, NY Live Arts, Wild Project, Dixon Place, Irving Plaza, SoHo Rep, Sony Music Hall, Bushwig, Judson Memorial Church and so many dive bars and dark corners."
            },
            {
                "name": "Mari Moriarty",
                "instagram": "@fempath",
                "bio": "Fempath is a queer transfem performer, director, & intimacy coordinator with a BFA in Drama, Directing from Carnegie Mellon University. Next up: Fempaths: A Cabaret Trantasia at Parkside Lounge 05/20. Most recently she wrote and directed the critically acclaimed Club Shortbus (2024) based on John Cameron Mitchell's 2006 film, and directed the world premiere of My Beatnik Youth by Justin Elizabeth Sayre at La MaMa. Other collaborations include: Lincoln Center, PAC NYC, Guthrie Theater, The New Group, Ars Nova, Geffen Playhouse, Powerhouse Theater, New York Stage & Film, The Tank, Theater for the New City, TADA! Youth Theater. She serves on the board of the Killer Queen Opera Company. SAG-AFTRA, SDC Associate Member. MariMoriarty.com."
            },
            {
                "name": "River L Ramirez",
                "instagram": "@pileoftears",
                "bio": "River L. Ramirez is an NYC based artist originally from Miami, FL. Working in the mediums of Comedy, Film, TV, Writing, Visual Art and Music, it's easy to forget they are just a little furby with a knife. River's work explores magick, collective consciousness, and liberation through play. Their work has been written about in the NYT, Forbes, Art in America, SSENSE, and GQ. They teach a class called \"How To Be In Front Of People\" (take it, it's amazing) at the Brick Aux. They just released a new EP: GIVING. and you can find them in Julio Torres's PROBLEMISTA."
            },
            {
                "name": "Yocheved Obliviana",
                "instagram": "@obliviana.arcana",
                "bio": "Yocheved is a multidisciplinary artist currently working on an opera, a high fantasy novel series, and a raunchy gay musical. As Obliviana, she creates bawdy and ethereal music to make you laugh, cry, and throw ass."
            }
        ],
        "specialGuests": [],
        "accompaniment": "Mamie Minch",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Sets by Libby Paloma @libbys_arty_party. Camp Counselors Libby Paloma & Macauley Devun @macauleydevun. Harmonies + stage management by Vandy @alafemmegaze. Visors and camp director nighttime look by @evvintagecollective.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17910301938035642.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [
            "img/ig-posts/17907721134140896.jpg",
            "img/ig-posts/18060588185148638.jpg",
            "img/ig-posts/18067923178995549.jpg",
            "img/ig-posts/18077014876868250.jpg",
            "img/ig-posts/18383955163140573.jpg",
            "img/ig-posts/18011587964729489.jpg",
            "img/ig-posts/17872504989359212.jpg",
            "img/ig-posts/17946113147988560.jpg",
            "img/ig-posts/18061504868173370.jpg"
        ],
        "recapCaption": "Thank you to everyone who participated in the Unprofessional Variety Show: Summer Camp edition!!! We all know that camp friends are the best friends."
    },
    {
        "title": "The Afterlife",
        "edition": 13,
        "date": "2025-02-23",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "Come take a peek behind the veil with us",
        "performers": [
            {
                "name": "Clay Woman",
                "instagram": "@claywomanhello",
                "bio": "Clay Woman is 500 million years old and comes from the Mirillion Galaxy. She is very excited to visit your planet and discuss the Afterlife and other topics with Earthlings at the Parkside Lounge."
            },
            {
                "name": "Fantasy Grandma",
                "instagram": "@fantasygrandma",
                "bio": "FANTASY GRANDMA is your grandma and has been making music and Jello for you since before you were born (New York Comedy Festival, Ars Nova, 54 Below, The Hollywood Improv, Zanies), and has been featured in the Village Voice, Time Out New York, The Chicago Tribune and on Epic Rap Battles of History but the accomplishment grandma will always be proudest of is you. Do you need any money? Do you want her to destroy your enemies? Old ladies get away with everything. Write her a letter or visit her at the Silent View Home For the Elderly in Tucson, Arizona. Can't visit grandma? Fantasy Grandma brings grandma to you, with all the love, acceptance, dirty and flirty you need from your grandma, in song. She'll never die because she's already dead."
            },
            {
                "name": "Joanie Drago",
                "instagram": "@joaniedrago",
                "bio": "Joanie Drago makes music and performance. She teaches playwriting and lives in Flatbush."
            },
            {
                "name": "Paula Merchan",
                "instagram": "@star_queen_567",
                "bio": "Born and raised in the Lower East Side, Colombian American Paula Caralinda Merchan has been performing in concerts since she was 5 years old. While studying at Third street Music School she had the opportunity to be a member of the Young People's Chorus and accompany The Gay Men's Chorus of New York in their performance at Carnegie Hall in 2003. Alongside several musical theater productions she then went on to private study with a focus in Opera at 7 years old until 2019 after the passing of her brother, Marcello G. Metscar. This will be her first time back on stage since."
            }
        ],
        "specialGuests": [],
        "accompaniment": "Klovis Gaynor & Larah Helayne",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Photos & video by @gmbelfiglio @davidwbullen and @lorenzotriburgo.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/18073312672735436.jpg",
        "isUpcoming": False,
        "description": "Come take a peek behind the veil with us",
        "recapImages": [
            "img/ig-posts/18007392368533269.jpg",
            "img/ig-posts/17993608430786173.jpg",
            "img/ig-posts/17893830261175009.jpg",
            "img/ig-posts/18098294098508125.jpg",
            "img/ig-posts/17882242527146618.jpg",
            "img/ig-posts/17856597318329551.jpg"
        ],
        "recapCaption": "Thank you to everyone who came to the February Unprofessional Variety Show: The Afterlife. We did indeed cross over to the other side."
    },
    {
        "title": "A Magic Show",
        "edition": 12,
        "date": "2024-12-15",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "Come cast a spell",
        "performers": [
            {
                "name": "Carrie Hawks",
                "instagram": "@maroonhorizon",
                "bio": "Carrie Hawks confronts self-imposed and external assumptions about identity in order to promote healing, particularly in relation to Blackness, gender, and queerness. They work in animation, drawing, collage, sculpture, and performance, often incorporating humor. Their film black enuf* was nominated for a New York Emmy, won Best Documentary Short at Trans Stellar Film Festival, was broadcast on American Public Television's World Channel in 2019. Their works have screened at numerous festivals including Tribeca, Ann Arbor, and BlackStar."
            },
            {
                "name": "Daniel Apolino Morales",
                "instagram": "@BrooklynMagicShop",
                "bio": "Daniel Apolino Morales began his professional magic performances through the art of street performing, then shifted to stage magic and performed at local fairs and theaters. Together in 2021, Daniel and his wife, Diana, opened Brooklyn Magic Shop where they created an immersive magic shop and magic theater where he currently teaches magic and performs his family-style magic shows and intimate magic and mentalism shows for adults."
            },
            {
                "name": "The Incredible Drunkertons (Sizzle and Funk)",
                "instagram": "@TheIncredibleDrunkertons",
                "bio": "The Incredible Drunkertons first rose to fame as the child stars of their eponymous hit prime-time series. After five record breaking seasons and countless accolades, the show was abruptly canceled. In the twenty years that followed, Sizzle and Funk were legally barred from recording or performing publicly although they never stopped creating and dreaming of a triumphant return. Now that their protracted legal battle with the [redacted] network is behind them, they are ready to take back their place at the top! Sizzle and Funk draw on a variety of influences and musical genres, with a particular passion for musical storytelling and cabaret. Their catalog includes original numbers and covers of hits from the 1960's through today. The Incredible Drunkertons find themselves in New York City most often, but are keen to get back on the road before returning to their showbiz home, the Las Vegas Strip."
            },
            {
                "name": "Stevie Dicks",
                "instagram": "@stevie.dicksss",
                "bio": "Stevie Dicks is a timeless witch whose essence combines the divine feminine and masculine in a whirlpool of ambiguity. Through performance, they provide energetic healing at an intersection of the past, present, and future."
            }
        ],
        "specialGuests": [
            {
                "name": "Helen Shirley",
                "instagram": "@helenshirley",
                "bio": ""
            },
            {
                "name": "Susana Cook",
                "instagram": "@susanacook77",
                "bio": ""
            },
            {
                "name": "Kris Grey",
                "instagram": "@krisgreystudio",
                "bio": ""
            }
        ],
        "accompaniment": "Klovis Gaynor & Mamie Minch",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Costuming by designers from @versbk.nyc styled by @tillydwolfe. Make up by @r0seandth0rn. Tech assist by @em_____miller. Door assist by @macauleydevun. Much assist by @angelomadsen. All the hustle by @gavinodownie and @the_parkside_lounge_nyc.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17855394342258698.jpg",
        "isUpcoming": False,
        "description": "Come cast a spell",
        "recapImages": [
            "img/ig-posts/18056429896936430.jpg",
            "img/ig-posts/18356716603193504.jpg",
            "img/ig-posts/17971300970807626.jpg",
            "img/ig-posts/18027928682567022.jpg",
            "img/ig-posts/18004340135516503.jpg",
            "img/ig-posts/18051835394478811.jpg"
        ],
        "recapCaption": "Thank you to everyone who came to Unprofessional Variety Show: A Magic Show and cast a spell. It was truly Magic-as seen in the work of these brilliant performers."
    },
    {
        "title": "In Sickness and Health",
        "edition": 11,
        "date": "2024-09-22",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "You know what the best medicine is.",
        "performers": [
            {
                "name": "Dexter Angel",
                "instagram": "@dextertheangel",
                "bio": "Dexter the Angel is a singer, songwriter, and the self-proclaimed Androgyne Superstar of the Lower East Side. In 2023 Dexter's song and music video for All The Boys Want To Be My Girl was featured in the Coney Island Film Festival and Nylon Magazine called it \"the closest thing we have to a punk siren's song.\" Dexter composes original music for theatre and is a regular DJ at venues throughout NYC. Since 2018 Dexter has DJed the monthly party Body Language at Nowhere Bar, currently the second Saturday of each month. The new album Dexter the Angel will be released online October 4 with a premiere party at Cmon Everybody October 6. Follow on all streaming platforms, Instagram and TikTok @dextertheangel"
            },
            {
                "name": "Kelli Dunham",
                "instagram": "@kellidunham",
                "bio": "Kelli Dunham is the nonbinary queer polyamorous ex-nun storytelling nurse comedian so common in modern Brooklyn. Kelli has appeared on Showtime and the Discovery Channel, PBS Stories From the Stage, the Moth Mainstage, NPR, nationwide at colleges, prides, fundraisers, oh so many nursing conferences and even the occasional livestock auction. Kelli is the author of seven hilarious nonfiction books about not humorous subjects including puberty, grief and death and you can hear Kelli chat with an eclectic group of guests about these very subjects as well as LGBT health, caregiving, mutual aid, and knock-knock jokes on her forthcoming podcast Second Helping. Former NYC Mayor Bill DeBlasio once called Kelli a show off. To her face."
            },
            {
                "name": "Libby Paloma",
                "instagram": "@libbys_arty_party",
                "bio": "Libby Paloma is a queercrip, Mexican-American interdisciplinary artist working primarily in sculpture and performance. Paloma utilizes installation, labor-intensive sculpture, and performance to create delightfully dazzling pieces. For over 15 years, Paloma has performed as Nacho, a mustached poet who claims to write his own music. Paloma's work is a playful mode of intervening in dominant and oppressive structures to offer alternative, softer, more joyous ways of engaging with self and others."
            },
            {
                "name": "Vague Static",
                "instagram": "@vague_static",
                "bio": "Drag creature and maker of games, Vague Static is the buzz in the back of your brain -- stirring up fae mischief and magic, they call you back into the wilds of nature. NYC born and raised, Vague is a black genderfluid storyteller and mixed media artist, bringing forth whatever world, characters, and clowns the occasion requires! You can see hymn sparkling around different clubs of Brooklyn, as well as helping bring the joy to life at the all-inclusive Lil Park Drag Show (and will be hosting the upcoming \"Cartoons\" show - Oct. 5th)!! Diversify your mind, see hymn flicker and shock before your very eyes!!"
            }
        ],
        "specialGuests": [],
        "accompaniment": "Klovis Gaynor",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Thank you Vandy @alafemmegaze and @LorenzoTriburgo for tech and documentation! Costume by Libby Paloma (organ suit).",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17996043425680710.jpg",
        "isUpcoming": False,
        "description": "Bring your sore and sorry bodies to our variety show. You know what the best medicine is.",
        "recapImages": [
            "img/ig-posts/17881339977132340.jpg",
            "img/ig-posts/18256650553252561.jpg",
            "img/ig-posts/17860571640248742.jpg",
            "img/ig-posts/18118224373364165.jpg",
            "img/ig-posts/17887306497038215.jpg",
            "img/ig-posts/17965341323797141.jpg",
            "img/ig-posts/18322699432152779.jpg",
            "img/ig-posts/18097879885455066.jpg",
            "img/ig-posts/18340399564121818.jpg"
        ],
        "recapCaption": "Thank you for everyone who came to Unprofessional Variety Show #11: In Sickness and Health"
    },
    {
        "title": "Once Upon A Time",
        "edition": 10,
        "date": "2024-05-19",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "",
        "performers": [
            {
                "name": "Bernard Elliot Davis",
                "instagram": "@bernardinthecity",
                "bio": "Bernard Elliot Davis is a New York City-based actor and singer featured in over a dozen Theatrical productions and films. With a unique career in Singing Telegrams, Bernard has performed for Dr. Oz, Janelle Monae, World News with Diane Sawyer, and MTV. Bernard got into Puppetry in 2020 and discovered his love and passion for the art and created the Pupten Show! The Pupten Show Represents the part of us that never grows up the part of us that's always playful, and adventurous but also curious. So come let's explore, laugh, be silly and learn about ourselves and others in creative ways through The Pupten Show! Bernard's favorite ice cream is cookies and cream!"
            },
            {
                "name": "Tanya Marquardt",
                "instagram": "@tanya.marquardt",
                "bio": "Tanya Marquardt is a writer and performer in Lenapehoking/Brooklyn. Their work is intimate -- memoirs, Tedtalk/seances, private dances, 'texting plays', epistolary performances written to dream lovers -- a fierce mucking about with vulnerability to get at life as a former runaway, third generation Magyar settler, and genderqueer. Their work has been presented at The Brick, Brooklyn Museum, BAX, The Tank, Dixon Place, The Collapsable Hole, PuSh, Summerworks, and Buddies in Bad Times. Currently they are learning a Magyar folk dance called 'legenycs', and creating a performance about the experience called Creature, which will be presented in June at Budapest's U500 Festival."
            },
            {
                "name": "Gilberto \"Gil\" Rivera",
                "instagram": "@gr.nyc",
                "bio": "Gilberto Gil Rivera, who you can call Gil, is a subway performer in New York City known for his trademark thigh-high red boots. He recently had the opportunity to audition for American Idol season 3 on ABC. You can see his audition online, or catch his act on a subway platform near you."
            },
            {
                "name": "Queerly Femmetastic",
                "instagram": "@QueerlyFemmetastic",
                "bio": "Brooklyn-bred bombshell Queerly Femmetastic is a nerdy connoisseur of Blackness. Her pronouns are she, her, and ma'am. Queerly is inspired by Black shake-dancers, strippers, and hoochie-coochie girls across generations. She is an internationally renowned ecdysiast, who currently holds 5 titles: Most High of the Mile High Burlesque Festival, Champion of the Exquisite Burlesque Festival, Golden Ratchet of the Revenge of the Blerds Burlesque Festival, Hollywood Chanteuse of the Hollywood Burlesque Festival, and most recently, Princess of the Panama Burlesque Festival. Queerly loves the smell of books, practicing sneaky splits, and the feeling of your money on her skin."
            }
        ],
        "specialGuests": [],
        "accompaniment": "",
        "emcee": "Maya Suess",
        "dj": "Serge Rodriguez",
        "notes": "After-party playlist by Serge Rodriguez @expertfundude.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17919376364909977.jpg",
        "isUpcoming": False,
        "description": "Once Upon A Time. . .",
        "recapImages": [
            "img/ig-posts/17866709673110234.jpg",
            "img/ig-posts/18070417096519064.jpg",
            "img/ig-posts/18050365624639300.jpg",
            "img/ig-posts/18019088333468829.jpg",
            "img/ig-posts/18099219220408090.jpg"
        ],
        "recapCaption": "Thank you to everyone who came to the tenth iteration of the Unprofessional Variety Show!! We had a gay ol' time telling stories. . ."
    },
    {
        "title": "A Clown Show",
        "edition": 9,
        "date": "2024-02-18",
        "time": "7:00 PM",
        "doors": "6:30 PM",
        "theme": "",
        "performers": [
            {
                "name": "Dr. Ksenia M. Soboleva",
                "instagram": "@ksenia.m.soboleva",
                "bio": "Dr. Ksenia M. Soboleva is a New York based writer, art historian, and professional lesbian specializing in queer art and culture. She holds a PhD from the Institute of Fine Arts, NYU, and is currently working on a book project titled \"Friendship as a Way of Art: Queer Identity and Visual Citation\" Soboleva is a regular contributor to the Brooklyn Rail and BOMB magazine, and her writings have appeared in various exhibition catalogues and artist monographs. She teaches at the New School and NYU."
            },
            {
                "name": "Edward \"Eak The Geek\" Arrocha",
                "instagram": "",
                "bio": "Edward Arrocha, aka Eak the Geek, Originally from Mexico City, came to the US in 1981 looking for adventure. He spent years writing poetry, traveling greyhound buses around the country and doing odd jobs until being introduced to the carnie lifestyle by \"Sneaky Pete\" (every lot has a Sneaky Pete). His first job in the lot was selling balloons, and after ending up in NYC in the late 80's, Edward found himself at Coney Island where he created the \"Eak the Geek\" Character. A long time resident of the East Village, Edward lives with his beautiful dog \"Tiny Girl,\" spends all his free time writing, and feels like a holdover of life in a different time and place."
            },
            {
                "name": "Xaddy Addy",
                "instagram": "@xaddyaddy",
                "bio": "Xaddy Addy is a gender-bending Black trans non-binary \"Femme King\" born and raised in Harlem, who is going to take us places. Xaddy is the winner of The Cakeboys' Takes The Cake season 2, a competition that highlights the artistry of drag kings and things all throughout NYC and the country. Xaddy has performed all over the five boroughs, blending the mediums of drag, burlesque, dance, theatre, sideshow, and visual storytelling within their artistry to create showstopping and thought-provoking work."
            },
            {
                "name": "Klovis Gaynor",
                "instagram": "@klovisgaynor",
                "bio": "Unprofessional favorite, and resident accompanist, Klovis Gaynor is returning for their annual serenade of original raunchy and heartfelt ballads. A Queens-based singer, songwriter & performer, their songs are confident, and forceful (even a little brutal) while evoking a sense of fragility and hope through loss. Klovis' forthcoming record, SAVE ME 4 THE SPANK BANK, comes out later this year & tells stories of sex & sadness. Don't miss the return of our favorite chanteuse, Klovis Gaynor!"
            }
        ],
        "specialGuests": [
            {
                "name": "Jess Dobkin / Pigeon the Clown",
                "instagram": "@Jess_Dobkin",
                "bio": "Jess Dobkin has been a working artist, curator, community activist, teacher and mentor for more than 30 years. Her practice extends across theatres and galleries, art fairs and subway stations, international festivals and museums, universities and public archives. She has operated an artist-run newsstand in a vacant subway station kiosk, a soup kitchen for artists, a breast milk tasting bar, and a performance festival hub for kids. To this Unprofessional, she'll be bringing her alter-ego, Pigeon the Clown. . ."
            },
            {
                "name": "Clew",
                "instagram": "@clew.cifer",
                "bio": "The ineffable revolutionary clown."
            }
        ],
        "accompaniment": "Klovis Gaynor",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Costumes by @evvintagecollective. A deep and heartfelt thank you to Queer Saint Cecilia Gentili for fomenting the revolution in our dystopic imaginary. Jess Dobkin/Pigeon the Clown was not able to perform but will be back at a future show.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/18222193564270579.jpg",
        "isUpcoming": False,
        "description": ". . . what did you expect? It was A Clown Show!",
        "recapImages": [
            "img/ig-posts/18014215670326851.jpg",
            "img/ig-posts/18022732145076065.jpg",
            "img/ig-posts/17987531474463310.jpg",
            "img/ig-posts/18035657002823278.jpg",
            "img/ig-posts/17931356108819367.jpg"
        ],
        "recapCaption": "THANK YOU FOR COMING to Unprofessional Variety Show #9: . . . what did you expect? It was A Clown Show!"
    },
    {
        "title": "A Bug's Life",
        "edition": 8,
        "date": "2023-12-10",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "We swarm, we are a mass. We dig, we tunnel, we weave, we work. We bite and sting. We transform.",
        "performers": [
            {
                "name": "Bizzy Barefoot",
                "instagram": "@cosmic_travesty",
                "bio": "Bizzy Barefoot is a radical queer, transgender artist, activist, communitarian, and Faerie. Her 40 year artistic career has been evenly divided between performance and visual art. She has performed on hundreds of stages all around the United States, in Canada and Europe, and has served as Artistic Director for the Pittsburgh Queer Theater Festival, and for two successful theater companies in Pittsburgh and NYC, of which she was also a co-founder. She was a longtime member of the critically acclaimed experimental performance group, The Nerve Tank in NYC. As visual artist and activist, she spent 9 years working with MIX NYC. She just wrapped filming on the 1st season of the NYC based queer fantasy series The Fae, and for the past several years has been workshopping the role of Lucifer Morningstar in the new developing musical Paradise Lost in Space."
            },
            {
                "name": "Macauley Devun",
                "instagram": "@macauleydevun",
                "bio": "Macauley DeVun has been a factory worker, barback, used furniture seller, go-go dancer, model, pastry chef, hanger-on, and multidisciplinary artist. They have performed at MoMA PS1, Dixon Place, La MaMa Experimental Theatre Club, PS122 (now Performance Space New York), and Wigstock."
            },
            {
                "name": "Veronica Garza",
                "instagram": "@veros_got_jokes",
                "bio": "Veronica Garza is a Brooklyn-based stand up comedian and writer originally from Dallas, Texas. She's been featured on MTV's \"Decoded\", NPR, Sirius XM, and Daily Mail. See her live at Unprofessional, and you'll be following her around town for more."
            },
            {
                "name": "Garnet Williams",
                "instagram": "@ms.ujubetta",
                "bio": "Garnet Williams is a writer, singer, and actor originally from Atlanta, Ga. Last seen in Skyward: An Endling Elegy (Lincoln Center), Cats (PAC), She Sings Me Home (Round House MD), and her one woman show Ugh: Another Girl and a Piano. Be ready to be to be transformed by Garnet's voice."
            }
        ],
        "specialGuests": [
            {
                "name": "Saul M. Nache",
                "instagram": "@saulmicahnache",
                "bio": "A Latinx and gay AF music director, singer, pianist, and voice teacher based out of NYC. Accompaniment for Garnet Williams."
            }
        ],
        "accompaniment": "Mamie Minch",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Ant Sisters: Libby Paloma & Maureen Catbagan @Moofro. Tech: Kipp Elbaum & Klovis Gaynor. Door: Courtney Jordan.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17897027015842525.jpg",
        "isUpcoming": False,
        "description": "We swarm, we are a mass. We dig, we tunnel, we weave, we work. We bite and sting. We transform. Join us.",
        "recapImages": [
            "img/ig-posts/18054477085517865.jpg",
            "img/ig-posts/18005841674041143.jpg",
            "img/ig-posts/18014824955018883.jpg",
            "img/ig-posts/18092181208385951.jpg",
            "img/ig-posts/18168711964290277.jpg"
        ],
        "recapCaption": "Thank you to the amazing performers who graced us with their metamorphic majesty at Unprofessional Variety Show #8: A Bug's Life. And thank you to the incredible audience who laughed with us through transformative times. Together we're a swarm."
    },
    {
        "title": "Breakfast",
        "edition": 7,
        "date": "2023-09-17",
        "time": "7:00 PM",
        "doors": "6:30 PM",
        "theme": "",
        "performers": [
            {
                "name": "Heather Lynn Johnson",
                "instagram": "@theheatherlynnjohnson",
                "bio": "Heather Lynn Johnson (she/they) is a multidisciplinary artist/poet. Their work is characterized by its lyricism and cultural critique, centering liberation with an emphasis on lost and reimagined histories. Heather's paintings have been exhibited at Pace Gallery, NY, (2023) Canada Gallery, NY (2023) and they had a solo exhibition, \"The Essence We Leave Behind\" at Nesto Gallery in MA, (2022). Heather has performed and exhibited their work internationally. They were a 2019 Leslie-Lohman Museum Fellow, a 2017 Literary Fellow for Queer|Art|Mentorship, and has been co-curating Queer|Art|Film since 2020. They are the author of The Survival Guide For Queer Black Youth (Inpatient Press, 2017)."
            },
            {
                "name": "Mo Angelos",
                "instagram": "",
                "bio": "Moe Angelos is a theatre artist and writer. She is one of the members of the infamous and groundbreaking theater group, Five Lesbian Brothers. She has been a member of NYC's Wow Cafe since 1981, works with The Builders Association and was a Queer/Art/Mentorship mentor. She's currently developing a piece with the Builders Association about artificial intelligence and its invisible influences on the democratic process, which is a lot more entertaining than it sounds. Moe's not on the socials so you'll just have to come to the show to \"follow\" her."
            },
            {
                "name": "Pete Struman",
                "instagram": "@petepetebk",
                "bio": "Pete Sturman has been performing since the early 1990s. He was half of the New Orleans queer folk music duo Pistol Pete & Popgun Paul; they traveled all over the country from 1998-2002 playing in small bars and coffeehouses. A prolific songwriter, he is known for his unique brand of clever, funny and poignant originals. First arriving as a Katrina refugee, Pete has been in NYC since 2006 and is in the midst of an ongoing stylistic evolution. He's been writing like crazy (20+ new songs in the last year), with his recent work featuring a lot of lead guitar."
            },
            {
                "name": "RuAfza",
                "instagram": "@ru.afza",
                "bio": "Take a cool sip of RuAfza, an up and coming Brooklyn based performer from Delhi, she brings the south delhi slut to New York. An immigrant struggling with visa issues she's always on the lookout for a green card marriage but just tips for her immigration lawyer fee would do as well."
            }
        ],
        "specialGuests": [
            {
                "name": "SirCumsized",
                "instagram": "@sircumsizeddrag",
                "bio": ""
            }
        ],
        "accompaniment": "Klovis Gaynor",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Costumes by @evvintagecollective. Hair by @davidwbullen. Breakfast buffet provided by @the_parkside_lounge_nyc. Breakfasted by @libby_arty_party. Cue Card master @gmbelfiglio. Tech team @stpeachesst and @kippelbaum. Door friend Courtney Jordan.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17977426073292076.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [
            "img/ig-posts/18006293419979935.jpg",
            "img/ig-posts/17963741720628565.jpg",
            "img/ig-posts/17970540305609581.jpg",
            "img/ig-posts/17991679508252480.jpg",
            "img/ig-posts/17982833687417327.jpg"
        ],
        "recapCaption": "THANK YOU FOR COMING TO UNPROFESSIONAL VARIETY SHOW #7: BREAKFAST"
    },
    {
        "title": "Won't You Be My Neighbor?",
        "edition": 6,
        "date": "2023-05-14",
        "time": "7:00 PM",
        "doors": "6:30 PM",
        "theme": "",
        "performers": [
            {
                "name": "earls2gearls",
                "instagram": "@earls2gearls",
                "bio": "earls2gearls: just two brothers and a much older guy from a weird part of Florida who became a boy band sensation after we all passed out from heat exhaustion in our 1994 Mickey Mouse Club auditions and woke up in the future. E2G is Justan, Donnie and Y2Kaleb and we are so proud to exist in a liminal space between teenage retroheterofantasia and non-binary trans pop extravaganza. E2G writes and sings all our own songs, and the only thing auto tuned is our personalities, Gearl. We're busy working with our momager @fantasygrandma on a whole album of original #1 hit pop songs for u, but we still managed to be Top Three in Cake Boys Takes the Cake and Battle Of The Boy Bands and ur #1 boyfriends 4 eva."
            },
            {
                "name": "Shawn Escarciga",
                "instagram": "@missladysalad",
                "bio": "Shawn is an artist who does things IRL and URL. Shawn's work has explored labor and class; questioning value systems and hierarchies; and ways to balance being silly with tangible moves towards equity and care. Their work encompasses performance, comedy, memes, language, and organizing, and has been shown across NYC, nationally and internationally at galleries, basements, museums, sex parties, on little and bigger screens, and in the hearts of every f-slur who dared to dream. More at @missladysalad and shawnescarciga.com"
            },
            {
                "name": "Moses Harper",
                "instagram": "@jmosesharper",
                "bio": "Moses Harper is a visionary of artistic expression in support of social empowerment and healing. She's a 21 degree creative, specializing in fine art, dance, motivational speaking, music, and literature. Harper has also established herself as a notable Michael Jackson tribute artist, performing at MSG, The Apollo Theater, and The Today Show, to name a few. She has a BA in Music from SUNY Purchase, plays 3 instruments, sings, and raps. In 2014 she released, \"Call Me Moses\", her memoir which revealed her as a survivor of abuse as a youth growing up in NYC. Her artwork has been featured on Pix 11, NY1, NBC, CBS, and ABC. In 2021, Harper published, \"Celebrate Black 365\", an art calendar including 13 of her pieces. Her second book, the first of a five book LGBT novel series entitled, \"Wesley House Book 1 : Remington and Charmaine\", was released in August 2022. At Unprofessional, Moses will be joined by 2 members of her cast to perform scenes from her 3rd stage play entitled, \"The Book of Love: Confessions of Love By Black Lesbians\"."
            },
            {
                "name": "Siobhan Meow",
                "instagram": "",
                "bio": "Siobhan Meow is a trans-species, New Yorker, having been part of the LES squatters movement for many decades. She joined Mr. Rogers for Unprofessional #6 to tell us about how she cares for the critters in the neighborhood."
            }
        ],
        "specialGuests": [],
        "accompaniment": "Klovis Gaynor",
        "emcee": "Maya Suess",
        "dj": "Serge Rodriguez",
        "notes": "Costume brilliance by Sarah Dahlinger @sarahdahlinger & East Village Vintage Collection @evvintagecollective. After-party playlist by Serge Rodriguez @expertfundude. Tech by @libby_arty_party & Kipp @kippelbaum. Amazing puppet costume of Lady Elaine Fairchilde by Sarah Dahlinger.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/18179721469280516.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [
            "img/ig-posts/18007307533725188.jpg",
            "img/ig-posts/17985909344106619.jpg",
            "img/ig-posts/17879522051816773.jpg",
            "img/ig-posts/17877542309873224.jpg",
            "img/ig-posts/17855636369938312.jpg",
            "img/ig-posts/17982516446298265.jpg",
            "img/ig-posts/18178629295286826.jpg",
            "img/ig-posts/18083221279354595.jpg"
        ],
        "recapCaption": "Thank you everyone who attended UNPROFESSIONAL VARIETY SHOW #6: Won't You Be My Neighbor? All the fun we had together, neighbors!"
    },
    {
        "title": "Birthday Suit Edition",
        "edition": 5,
        "date": "2023-02-26",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "",
        "performers": [
            {
                "name": "Mistah Coles",
                "instagram": "@mistahcoles",
                "bio": "Mistah Coles, drag king, playwright, director, producer, actor, filmmaker, founder of The Madiba Movement. Co-facilitator of NY Metro Coming To The Table, WOW Cafe Theater Board member, and an all around fun person to know. Pronouns: anything but 'it' and the 'n' word!"
            },
            {
                "name": "Klovis Gaynor",
                "instagram": "@bushybussybullybackagain",
                "bio": "Klovis Gaynor is a multimedia artist creating autoethnographic projects around failure, fame, sex, violence, reality and dissociative identities. He will be tickling all of our ivories, returning for his second Unprofessional performance!"
            },
            {
                "name": "Fareeha Khan",
                "instagram": "@fareeeezy",
                "bio": "Fareeha Khan is a comedian and artist based in New York City. She's been on Comedy Central's \"Tight Five\" presented by Ilana Glazer, has toured her stand up with Man Repeller, and was featured on the NBC showcase at the Women in Comedy Festival. Her humor writing has appeared on MTV Decoded, Reductress, and in the book Every Body. She has acted in sketches on Jimmy Kimmel Live!, Comedy Central, and Adult Swim, as well as several indie short films, including 1/30, which was executive produced by Lena Waithe. Her short film she created, wrote, and starred in, Break Up, Baby, was a NoBudge 2021 pick and Vulture said she has \"an enchanting onscreen presence\" in it, which was pretty cool. She self-publishes zines, essays, and comics exploring the search for meaning in the trappings of capitalism, which you can find on her website: fareeha-khan.com."
            },
            {
                "name": "Libby Paloma",
                "instagram": "@libby_art_party",
                "bio": "Libby Paloma is an interdisciplinary queer, mixed Mexican American artist working primarily in soft sculpture installation and performance. For over 15 years, Paloma has performed as Nacho, a mustached poet who claims to write his own music. A word of warning about Nacho, he so sexually arousing that after meeting him, you won't be able to stop thinking about his man meat."
            }
        ],
        "specialGuests": [],
        "accompaniment": "",
        "emcee": "Maya Suess",
        "dj": "Serge Rodriguez",
        "notes": "After-party playlist by Serge Rodriguez @expertfundude. Birthday suit costumes by Dew @suppressingyays and Jesse Harrod @jesseharrod1. Originally Shawn Escarciga @missladysalad and CICLON @bestial_provocations were on the lineup but had to be replaced.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/18281532751103918.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [
            "img/ig-posts/17966823464218473.jpg",
            "img/ig-posts/18177739165264356.jpg",
            "img/ig-posts/17992882825749946.jpg",
            "img/ig-posts/18245662621155852.jpg",
            "img/ig-posts/17949144263356851.jpg",
            "img/ig-posts/17945638661590209.jpg",
            "img/ig-posts/17967802259273007.jpg",
            "img/ig-posts/18002877025615777.jpg"
        ],
        "recapCaption": "THANK YOU to all the performers and our smoking hot audience who came out to support another Unprofessional Variety Show. What a dream this line up was, here's a little snippet if you missed it."
    },
    {
        "title": "Teen Edition",
        "edition": 4,
        "date": "2022-12-04",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "",
        "performers": [
            {
                "name": "Susana Cook",
                "instagram": "@susanacook77",
                "bio": "Susana Cook is an Argentinean-born New York-based experimental performance artist. Her hilariously surrealistic spectacles combine her long experience in political theater, experimental performance with cabaret elements, thus creating a funny, smart and often cathartic theatrical experience. Some of her most memorable pieces are \"Run! It's Getting Ugly!\", \"The Homophobes\", \"100 Years of Attitude\", and the unforgettable \"Tango Lesbiango.\""
            },
            {
                "name": "Darlinda Just Darlinda",
                "instagram": "@darlindajust",
                "bio": "An artist with a lifelong commitment to queer performance, Darlinda Just Darlinda is a Performance Artist, actor, Model, Burlesque Performer, comedian and Producer based in New York City, who has internationally toured to Australia, Canada, Hong Kong, England, Finland, France, Germany, Iceland, & Sweden! You can find Darlinda's work off Broadway, in film and tv and she is a regular performer at superb NYC venues like The Slipper Room, House of Yes, and Paradise Club at Times Square Edition. She is recipient of the first and multiple winner of The Brooklyn Nightlife Awards: Best Burlesque Dancer!"
            },
            {
                "name": "Dexter Driscoll",
                "instagram": "@dexterdriscoll",
                "bio": "Dexter Driscoll is a performer and songwriter. Dexter hosts karaoke At the Parkside Lounge, as well as the upcoming Parkside TV. A new album will be released in early 2023. Don't forget to watch Dexter's new music video \"Pretty Boy.\""
            },
            {
                "name": "Antonio Ramos",
                "instagram": "@antrinidad007",
                "bio": "Antonio Ramos is a Loca from Puerto Rico who has been living in NYC for a long time pretending to be professional. He is a choreographer, multidisciplinary artist, massage therapist, and Shamana."
            },
            {
                "name": "Lyle Ravi Kash",
                "instagram": "@queerelle",
                "bio": "Performing with Antonio Ramos."
            }
        ],
        "specialGuests": [],
        "accompaniment": "",
        "emcee": "Maya Suess",
        "dj": "Serge Rodriguez",
        "notes": "After-party playlist by Serge Rodriguez @expertfundude. Tech by Dew @suppressingyays. Costume Sponsors: 3rd & B'zaar @3rdandbzaar and the East Village Vintage Collective @evvintagecollective.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17995158445600912.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [
            "img/ig-posts/17935888787416599.jpg",
            "img/ig-posts/17852750402872233.jpg",
            "img/ig-posts/17956431125087598.jpg",
            "img/ig-posts/17973514153924034.jpg",
            "img/ig-posts/17995408414592430.jpg",
            "img/ig-posts/18021253195460729.jpg"
        ],
        "recapCaption": "Thank you to everyone who joined us at Unprofessional Variety Show #4: The Teen Edition!! It was, like, uh, okayyyy. . ."
    },
    {
        "title": "The Night",
        "edition": 3,
        "date": "2022-09-18",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "",
        "performers": [
            {
                "name": "Rae De Vine",
                "instagram": "@raeraendem",
                "bio": "Rae De Vine (she/they) is a Queer, Black, and Indigenous vocalist, poet, and performer; their work spans multiple genres and contexts, and they approach art as a vehicle for healing and building community. They also work as an educator and facilitator, and deeply believe in the transformative power of the arts in education."
            },
            {
                "name": "Tiana GlittersaurusRex",
                "instagram": "@glittersaurus.rex",
                "bio": "Tiana GlittersaurusRex is President of the Sex Work Survival Guide, and has publicly spoken about: trauma informed consent, cannabis, alternative lifestyles and sex positivity. She has a passion for building community through curating experiences that celebrate inclusivity and education."
            },
            {
                "name": "Elizabeth Koke",
                "instagram": "@elizabethkoke",
                "bio": "Elizabeth Koke is a writer, performer, and organizer from NYC. She has participated in readings and performances at Dixon Place, Wild Project, Brooklyn Museum, Joe's Pub, and other assorted venues, backyards, and dive bars. She is currently Creative Director for Housing Works where she enjoys a healthy balance of thrift shopping and hell raising. She lives in the Lower East Side where she spends time at her favorite local bar, the Parkside Lounge, with her rescue dog, Onyx."
            },
            {
                "name": "Sleth Larson",
                "instagram": "@sleth.gov_",
                "bio": "A gemini with mischievous but kind eyes, Sleth was sliced from the belly of a drowned Texas river horse sometime around June 1990. Sleth writes plays, erratic PowerPoints, and recently, a whole manic slew of as-of-yet unproduced television pilots. Sleth describes Sleth as friendly, slutty and adventurous."
            }
        ],
        "specialGuests": [],
        "accompaniment": "Klovis Gaynor & Riley Thomas",
        "emcee": "Maya Suess",
        "dj": "",
        "notes": "Costume Sponsors: 3rd & B'zaar @3rdandbzaar and the East Village Vintage Collective @evvintagecollective.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17961193069923559.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [],
        "recapCaption": ""
    },
    {
        "title": "Pasts and Futures",
        "edition": 2,
        "date": "2022-05-22",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "",
        "performers": [
            {
                "name": "Sacha Yanow",
                "instagram": "@sachayanow",
                "bio": "SACHA YANOW is a Lenapehoking/NYC based performance artist. Their recent solo pieces draw from theater and performance art, using humor and physicality to explore aging, gender, desire, and Ashkenazi Jewish assimilation. Sacha's work has been presented by venues including MoMA PS1, Danspace Project, Joe's Pub, and the New Museum in NYC; PICA's TBA Festival/Cooley Gallery in Portland, OR; and Festival Theaterformen in Hanover, Germany. They received a BA from Sarah Lawrence College and graduated from the William Esper Studio Actor Training Program. www.sachayanow.com"
            },
            {
                "name": "Fernando Vieira",
                "instagram": "@fernandovieirausa",
                "bio": "Fernando Vieira is an Ecuadorian-born New York-based writer, director, and performer, who debuted as a playwright and stage director with the one-person monologue \"Me Voy Porque Puedo\" in 2016. Viera created and produced Botate! Latinx Performance Festival in East Harlem in the Summer of 2021 and performs and directs regularly around the country. Vieira has an upcoming role in Repertorio Espanol's play \"Eva Luna\", which will debut in the summer of 2022."
            },
            {
                "name": "JD Pluecker",
                "instagram": "",
                "bio": "JD Pluecker works with language: writes, translates, organizes, interprets, and creates things in spaces with others. Their most recent translation from Spanish into English is Writing with Caca by Luis Felipe Fabre, a biography of the 1920s Mexican writer Salvador Novo that investigates the potentials of writing as a process of excretion, not creation. JD worked for many years with the language justice collectives of Antena, which closed in the first year of the pandemic in 2020. JD started making zines as a teenager and still makes their own work public in the form of limited-run books."
            },
            {
                "name": "Megan Milks",
                "instagram": "@sklimnagem",
                "bio": "Megan Milks is the author of MARGARET AND THE MYSTERY OF THE MISSING BODY and SLUG AND OTHER STORIES, both published by Feminist Press in the fall of 2021. Their personal history of early online fandom, TORI AMOS BOOTLEG WEBRING, was released last year as Book 2 in Instar Books' Remember the Internet series."
            },
            {
                "name": "Dee Luu",
                "instagram": "@iamdeeluu",
                "bio": "Dee Luu (she/they) is a trans writer and performer who was most recently part of Ars Nova's CAMP Residency where she created her virtual sketch show TRANS MOSES! which explores the unique experience of being a newly out trans person of color. She can also be seen regularly her sketch group Queer Window which is currently in residency at Squirrel Comedy Theatre."
            },
            {
                "name": "Vague Static",
                "instagram": "@vague_static",
                "bio": "The Great Being, the patron bitch of variety show and cabaret, the deity of all things raunchy and distasteful, the cosmic point where humor and discomfort suck face, the protector of all sacred weirdos."
            }
        ],
        "specialGuests": [],
        "accompaniment": "Klovis Gaynor",
        "emcee": "Maya Suess",
        "dj": "Serge Rodriguez",
        "notes": "Dance party tunes by @expertfundude. Documentation by @bestial_provocations. Thank you Courtney Jordan for working the door. Photos by @davidwbullen @angelomadsen @sarahdahlinger & @bestial_provocations. The incredible work of the deeply missed performer Danielle J Abrams was also present.",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/17912786009380839.jpg",
        "isUpcoming": False,
        "description": "",
        "recapImages": [
            "img/ig-posts/18209754391148174.jpg",
            "img/ig-posts/17995598953427524.jpg",
            "img/ig-posts/17846168174782483.jpg",
            "img/ig-posts/17973867454563109.jpg",
            "img/ig-posts/17936756765150188.jpg",
            "img/ig-posts/17878151648680437.jpg",
            "img/ig-posts/18207085423157411.jpg",
            "img/ig-posts/17952187387748062.jpg"
        ],
        "recapCaption": "Thank you to everyone who came to Unprofessional 2.0: Pasts and Futures. The performances were the best that a lavender night could offer."
    },
    {
        "title": "Birthday Edition",
        "edition": 1,
        "date": "2022-02-20",
        "time": "7:30 PM",
        "doors": "7:00 PM",
        "theme": "",
        "performers": [
            {
                "name": "CICLON",
                "instagram": "@bestial_provocations",
                "bio": "CICLON is a necromancer and trans*media storyteller that is moved by quantum connectivities within and beyond the technosphere. Their recent work establishes meaningful connections amongst goddexxes, ghosts, animals, plants, and the elements. They seek to amplify spectra of desire."
            },
            {
                "name": "Jack Waters & Peter Cramer",
                "instagram": "@jaceogram",
                "bio": "Peter Cramer and Jack Waters are truly legends in our community. Cramer and Waters were a catalytic force behind POOL, a dance/performance collective in the early 80's. They are co-founders, artistic & administrative directors of Le Petit Versailles community garden in the Lower East Side. Former & Current Executive Directors of Allied Productions, Inc. established in 1981, and Co-Directors at ABC No Rio from 1983-90. Their works are in the collections of the NYC Library Of Performing Arts, The Film Makers' Cooperative, NYC Public Library AIDS Activist Video Collection, and more. Their activism and art centering AIDS, LGBT political struggles, sexual/racial identity and erotic subjects have inspired so many of us. Waters and Cramer are subjects of an oral history on the website and catalogue of the Smithsonian Institution in Washington D.C., and beloved by those of us who know them."
            },
            {
                "name": "Cherish Violet Blood",
                "instagram": "@bloodcherish",
                "bio": "Actor, storyteller, and activist, Cherish Violet Blood is a proud Blackfoot woman who hails from the Kainai Nation, or Blood Tribe Reserve #148 in Treaty 7 territory located in southern Alberta. Currently based in Toronto, Ontario, Cherish is a well recognized performing artist with active followings in the national Indigenous and international theatre communities. Select credits include creator/performer in Material Witness (Spiderwoman Theatre La Mama, NYC), creator/performer in Making Treaty 7 directed by Michelle Thrush. She is also known for her performance in the award winning film, Scarborough, which premiered at TIFF in 2021."
            },
            {
                "name": "Klovis Gaynor",
                "instagram": "@crumdogmillionare",
                "bio": "Klovis Gaynor is a Brooklyn based multimedia artist creating autoethnographic projects around failure, fame, sex, violence, reality and dissociative identities. His work manifests in a variety of forms including performance, sound, video, paint, thread, and installation. He directs and curates experimental video art and performance. At Unprofessional Klovis will sing to us about the aches of being alive, with original songs on the piano."
            },
            {
                "name": "Stephanie Acosta",
                "instagram": "@wakingstephanie",
                "bio": "Stephanie Acosta is an interdisciplinary artist, writer and curator who places the materiality of the ephemeral at the center of her practice, creating fleeting performance works that examine site, space, and perception in shared experiences. Her exhibition record and work is impressive. If you were lucky enough to see her piece \"This Bridge Called My Ass\" which premiered in 2019 American Realness with a dynamic cast of Latinx performers, you know what we mean."
            },
            {
                "name": "Penelope the Clown",
                "instagram": "@clownpenelope",
                "bio": "Penelope the Clown is what Kaitlin Kaufman would be like if the education system didn't impolitely tell her at 5 years old to \"shhhhh\". Penelope has performed all over, including at Dixon Place, HERE Arts Center, Stonewall Inn, Chinatown Soup, The PIT, The Tank, And The Brick. Her solo show, Yay America!, won the Critic's Choice Award at PortFringe and Most Likely to Cause Whiplash over Myth of Democracy at FringePVD. Penelope's voice is as big as her heart and she wants you to know that everything is going to be just fine."
            },
            {
                "name": "Serge Rodriguez",
                "instagram": "@expertfundude",
                "bio": "Serge Rodriguez is a Nuyorican from this neighborhood. Former DJ from the beloved @Woahmone parties, he is also a writer and lover of Trans literature. Serge will be making us a Birthday Playlist for post show celebration."
            }
        ],
        "specialGuests": [],
        "accompaniment": "",
        "emcee": "Maya Suess",
        "dj": "Serge Rodriguez",
        "notes": "Free entry. No cover. Come ready to tip the bartenders and the performers. Support queer/trans run spaces. The first ever Unprofessional Variety Show!",
        "ticketUrl": "",
        "posterImage": "img/ig-posts/18030802729332339.jpg",
        "isUpcoming": False,
        "description": "Happy birthday to us all!!",
        "recapImages": [
            "img/ig-posts/17935027849992614.jpg",
            "img/ig-posts/17904789263374430.jpg",
            "img/ig-posts/17977431940493191.jpg",
            "img/ig-posts/18282769849039717.jpg",
            "img/ig-posts/17904282083372634.jpg"
        ],
        "recapCaption": "Thank you to everyone who came to the FIRST Unprofessional Variety Show. Happy birthday to us all!! Brilliant performances by CICLON, Jack Waters & Peter Cramer, Cherish Violet Blood and Klovis Gaynor."
    }
]

# Write the output
output_dir = "/tmp/clients/maya/content"
os.makedirs(output_dir, exist_ok=True)

output_path = os.path.join(output_dir, "shows.json")
with open(output_path, "w") as f:
    json.dump(shows, f, indent=2, ensure_ascii=False)

print(f"Generated {output_path}")
print(f"Total shows: {len(shows)}")
for s in shows:
    performer_count = len(s["performers"]) + len(s.get("specialGuests", []))
    print(f"  #{s['edition']:2d} | {s['date']} | {s['title']:<30s} | {performer_count} performers")
