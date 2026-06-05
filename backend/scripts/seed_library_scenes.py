"""
Seed the curated public-domain scene library into the database.

This creates ~16 system-wide LIBRARY scenes (is_library=True, user_script_id=NULL)
that all users can browse and rehearse without uploading a script. Each scene links
to a real public-domain Play (title + author = attribution).

Idempotency: keyed on (Play.title + Scene.title). A scene is skipped if a Scene with
that title and is_library=True already exists. Safe to re-run.

NOTE: requires the `is_library` column on the `scenes` table. If the migration
adding it has not been applied yet, run that migration before running this script.

Run:
    python backend/scripts/seed_library_scenes.py
"""

import sys
from pathlib import Path

backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import SessionLocal
from app.models.actor import Play, Scene, SceneLine


def _get_or_create_play(db, *, title, author, genre, category, year_written=None):
    """Return an existing Play by (title, author) or create one. Reused across scenes."""
    play = (
        db.query(Play)
        .filter(Play.title == title, Play.author == author)
        .first()
    )
    if play:
        return play
    play = Play(
        title=title,
        author=author,
        year_written=year_written,
        genre=genre,
        category=category,
        copyright_status="public_domain",
    )
    db.add(play)
    db.flush()
    return play


def _add_lines(db, scene, lines):
    """Create SceneLine rows for `lines` = [(character, text, direction), ...]."""
    for i, (character, text, direction) in enumerate(lines):
        line = SceneLine(
            scene_id=scene.id,
            line_order=i,
            character_name=character,
            text=text,
            stage_direction=f"[{direction}]" if direction else None,
            word_count=len(text.split()),
        )
        db.add(line)


def _seed_scene(db, *, play, title, act, scene_number, description,
                c1, c1_gender, c2, c2_gender, difficulty, primary_emotions,
                relationship_dynamic, tone, setting, lines):
    """
    Create one library Scene + its lines, unless a library Scene with this title
    already exists. Returns True if seeded, False if skipped.
    """
    existing = (
        db.query(Scene)
        .filter(Scene.title == title, Scene.is_library == True)  # noqa: E712
        .first()
    )
    if existing:
        print(f"  SKIP   {title} (already in library, scene_id={existing.id})")
        return False

    total_words = sum(len(text.split()) for _, text, _ in lines)
    estimated_duration_seconds = max(30, round(total_words / 150 * 60))

    scene = Scene(
        play_id=play.id,
        user_script_id=None,
        is_library=True,
        title=title,
        act=act,
        scene_number=scene_number,
        description=description,
        character_1_name=c1,
        character_2_name=c2,
        character_1_gender=c1_gender,
        character_2_gender=c2_gender,
        line_count=len(lines),
        estimated_duration_seconds=estimated_duration_seconds,
        difficulty_level=difficulty,
        primary_emotions=primary_emotions,
        relationship_dynamic=relationship_dynamic,
        tone=tone,
        setting=setting,
    )
    db.add(scene)
    db.flush()
    _add_lines(db, scene, lines)
    print(f"  SEED   {title} ({play.author}) -> scene_id={scene.id}, {len(lines)} lines")
    return True


# ============================================================================
# One function per source play
# ============================================================================

def seed_romeo_juliet(db):
    play = _get_or_create_play(
        db, title="Romeo and Juliet", author="William Shakespeare",
        genre="tragedy", category="classical", year_written=1597,
    )
    return _seed_scene(
        db, play=play,
        title="Romeo and Juliet — The Balcony",
        act="Act 2", scene_number="Scene 2",
        description="Romeo overhears Juliet confess her love from her balcony, then reveals himself. They pledge themselves to one another despite their feuding families.",
        c1="ROMEO", c1_gender="male", c2="JULIET", c2_gender="female",
        difficulty="intermediate",
        primary_emotions=["love", "longing", "wonder", "hope"],
        relationship_dynamic="romantic",
        tone="romantic",
        setting="The Capulet orchard, beneath Juliet's window, by night",
        lines=[
            ("JULIET", "O Romeo, Romeo! wherefore art thou Romeo? Deny thy father and refuse thy name; or, if thou wilt not, be but sworn my love, and I'll no longer be a Capulet.", None),
            ("ROMEO", "Shall I hear more, or shall I speak at this?", "aside"),
            ("JULIET", "'Tis but thy name that is my enemy; thou art thyself, though not a Montague. What's Montague? It is nor hand, nor foot, nor arm, nor face, nor any other part belonging to a man.", None),
            ("JULIET", "What's in a name? That which we call a rose by any other name would smell as sweet.", None),
            ("ROMEO", "I take thee at thy word. Call me but love, and I'll be new baptized; henceforth I never will be Romeo.", None),
            ("JULIET", "What man art thou that thus bescreen'd in night so stumblest on my counsel?", "startled"),
            ("ROMEO", "By a name I know not how to tell thee who I am. My name, dear saint, is hateful to myself, because it is an enemy to thee.", None),
            ("JULIET", "My ears have not yet drunk a hundred words of that tongue's utterance, yet I know the sound. Art thou not Romeo, and a Montague?", None),
            ("ROMEO", "Neither, fair saint, if either thee dislike.", None),
            ("JULIET", "How camest thou hither, tell me, and wherefore? The orchard walls are high and hard to climb, and the place death, considering who thou art, if any of my kinsmen find thee here.", None),
            ("ROMEO", "With love's light wings did I o'erperch these walls; for stony limits cannot hold love out, and what love can do that dares love attempt.", None),
            ("JULIET", "Dost thou love me? I know thou wilt say 'Ay,' and I will take thy word.", None),
            ("ROMEO", "Lady, by yonder blessed moon I vow, that tips with silver all these fruit-tree tops—", None),
            ("JULIET", "O, swear not by the moon, the inconstant moon, that monthly changes in her circled orb, lest that thy love prove likewise variable.", None),
        ],
    )


def seed_macbeth(db):
    play = _get_or_create_play(
        db, title="Macbeth", author="William Shakespeare",
        genre="tragedy", category="classical", year_written=1606,
    )
    return _seed_scene(
        db, play=play,
        title="Macbeth — After the Murder",
        act="Act 2", scene_number="Scene 2",
        description="Moments after murdering King Duncan, a shattered Macbeth returns to his wife, still gripping the bloody daggers. Lady Macbeth steadies him and tries to bury their guilt.",
        c1="MACBETH", c1_gender="male", c2="LADY MACBETH", c2_gender="female",
        difficulty="advanced",
        primary_emotions=["guilt", "terror", "paranoia", "resolve"],
        relationship_dynamic="adversarial",
        tone="tragic",
        setting="A courtyard within Macbeth's castle at Inverness, night",
        lines=[
            ("MACBETH", "I have done the deed. Didst thou not hear a noise?", None),
            ("LADY MACBETH", "I heard the owl scream and the crickets cry. Did not you speak?", None),
            ("MACBETH", "When?", None),
            ("LADY MACBETH", "Now.", None),
            ("MACBETH", "As I descended?", None),
            ("LADY MACBETH", "Ay.", None),
            ("MACBETH", "This is a sorry sight.", "looking at his hands"),
            ("LADY MACBETH", "A foolish thought, to say a sorry sight.", None),
            ("MACBETH", "Methought I heard a voice cry 'Sleep no more! Macbeth does murder sleep,'—the innocent sleep, sleep that knits up the ravell'd sleave of care.", None),
            ("LADY MACBETH", "What do you mean?", None),
            ("MACBETH", "Still it cried 'Sleep no more!' to all the house: 'Glamis hath murder'd sleep, and therefore Cawdor shall sleep no more; Macbeth shall sleep no more.'", None),
            ("LADY MACBETH", "Who was it that thus cried? Why, worthy thane, you do unbend your noble strength, to think so brainsickly of things. Go get some water, and wash this filthy witness from your hand.", None),
            ("LADY MACBETH", "Why did you bring these daggers from the place? They must lie there. Go carry them, and smear the sleepy grooms with blood.", None),
            ("MACBETH", "I'll go no more. I am afraid to think what I have done; look on't again I dare not.", None),
            ("LADY MACBETH", "Infirm of purpose! Give me the daggers. The sleeping and the dead are but as pictures. 'Tis the eye of childhood that fears a painted devil.", None),
            ("MACBETH", "Will all great Neptune's ocean wash this blood clean from my hand? No, this my hand will rather the multitudinous seas incarnadine, making the green one red.", None),
        ],
    )


def seed_earnest(db):
    play = _get_or_create_play(
        db, title="The Importance of Being Earnest", author="Oscar Wilde",
        genre="comedy", category="classical", year_written=1895,
    )
    return _seed_scene(
        db, play=play,
        title="The Importance of Being Earnest — Gwendolen and Cecily at Tea",
        act="Act 2", scene_number=None,
        description="Two young women, each believing she is engaged to a man named Ernest, take tea together. Their elaborate politeness curdles into a duel of barbed civility.",
        c1="GWENDOLEN", c1_gender="female", c2="CECILY", c2_gender="female",
        difficulty="beginner",
        primary_emotions=["jealousy", "amusement", "indignation", "pride"],
        relationship_dynamic="rivals",
        tone="comedic",
        setting="The garden at the Manor House, Woolton",
        lines=[
            ("CECILY", "Pray let me introduce myself to you. My name is Cecily Cardew.", None),
            ("GWENDOLEN", "Cecily Cardew? What a very sweet name! Something tells me that we are going to be great friends. I like you already more than I can say.", None),
            ("CECILY", "How nice of you to like me so much after we have known each other such a comparatively short time.", None),
            ("GWENDOLEN", "You are here on a short visit, I suppose.", None),
            ("CECILY", "Oh no! I live here.", None),
            ("GWENDOLEN", "Indeed? Your mother, no doubt, or some female relative of advanced years, resides here also?", None),
            ("CECILY", "Oh no! I have no mother, nor, in fact, any relations.", None),
            ("GWENDOLEN", "Cecily, mamma, whose views on education are remarkably strict, has brought me up to be extremely short-sighted; it is part of her system. So do you mind my looking at you through my glasses?", None),
            ("CECILY", "Oh! not at all, Gwendolen. I am very fond of being looked at.", None),
            ("GWENDOLEN", "You are here, no doubt, as Mr. Worthing's ward?", None),
            ("CECILY", "Oh no! I am not Mr. Worthing's ward. It is Mr. Worthing who is my guardian. And I am going to be his wife's nephew's... his cousin's... no. Mr. Ernest Worthing is going to be my husband.", None),
            ("GWENDOLEN", "I am afraid you are under some misconception. Ernest Worthing is engaged to me. The announcement will appear in the Morning Post on Saturday at the latest.", "rising"),
            ("CECILY", "I am sorry to undeceive you, but Ernest proposed to me exactly ten minutes ago.", "very politely, rising"),
            ("GWENDOLEN", "It is certainly very curious, for he asked me to be his wife yesterday afternoon at 5.30. If you would care to verify the incident, pray do so. I never travel without my diary.", None),
            ("CECILY", "It would distress me more than I can tell you, dear Gwendolen, if it caused you any mental or physical anguish, but I feel bound to point out that since Ernest proposed to you he clearly has changed his mind.", None),
        ],
    )


def seed_dolls_house(db):
    play = _get_or_create_play(
        db, title="A Doll's House", author="Henrik Ibsen",
        genre="drama", category="classical", year_written=1879,
    )
    return _seed_scene(
        db, play=play,
        title="A Doll's House — Nora Leaves",
        act="Act 3", scene_number=None,
        description="Their secret exposed, Nora finally confronts Torvald with the truth of their marriage. She announces that she is leaving him to discover who she truly is.",
        c1="NORA", c1_gender="female", c2="TORVALD", c2_gender="male",
        difficulty="advanced",
        primary_emotions=["disillusionment", "resolve", "anger", "awakening"],
        relationship_dynamic="romantic",
        tone="tragic",
        setting="The Helmers' sitting room, late at night",
        lines=[
            ("NORA", "Sit down. It will take some time; I have a lot to talk over with you.", None),
            ("TORVALD", "You alarm me, Nora! And I don't understand you.", None),
            ("NORA", "No, that is just it. You don't understand me, and I have never understood you either—before tonight.", None),
            ("TORVALD", "What do you mean by that?", None),
            ("NORA", "In all these eight years we have never exchanged a serious word about serious things.", None),
            ("TORVALD", "Was it likely that I would be continually and forever telling you about worries that you could not help me to bear?", None),
            ("NORA", "I am not speaking about business matters. I say that we have never sat down in earnest together to try and get at the bottom of anything.", None),
            ("TORVALD", "But, dearest Nora, would it have been any good to you?", None),
            ("NORA", "That is just it; you have never understood me. I have been greatly wronged, Torvald—first by papa and then by you.", None),
            ("TORVALD", "What! By us two—who have loved you better than anyone else in the world?", None),
            ("NORA", "You have never loved me. You have only thought it pleasant to be in love with me.", None),
            ("TORVALD", "Nora, what do I hear you saying?", None),
            ("NORA", "It is perfectly true, Torvald. When I was at home with papa, he told me his opinions, and so I had the same opinions; and you arranged everything according to your own taste. I have existed merely to perform tricks for you.", None),
            ("TORVALD", "How unreasonable and how ungrateful you are, Nora! Have you not been happy here?", None),
            ("NORA", "No, I have never been happy. I thought I was, but it has never really been so. I have been your doll-wife, just as at home I was papa's doll-child.", None),
            ("NORA", "I must stand quite alone, if I am to understand myself and everything about me. It is for that reason that I cannot remain with you any longer.", None),
        ],
    )


def seed_the_seagull(db):
    play = _get_or_create_play(
        db, title="The Seagull", author="Anton Chekhov",
        genre="drama", category="classical", year_written=1896,
    )
    return _seed_scene(
        db, play=play,
        title="The Seagull — Nina and Trigorin",
        act="Act 2", scene_number=None,
        description="The aspiring actress Nina presses the famous writer Trigorin about the glory of his life. He answers with the weariness and compulsion of a man who cannot stop writing.",
        c1="NINA", c1_gender="female", c2="TRIGORIN", c2_gender="male",
        difficulty="intermediate",
        primary_emotions=["yearning", "weariness", "admiration", "restlessness"],
        relationship_dynamic="mentor-and-admirer",
        tone="dramatic",
        setting="A croquet lawn beside a lake on Sorin's estate",
        lines=[
            ("NINA", "Your life is beautiful.", None),
            ("TRIGORIN", "I see nothing especially lovely about it. I am haunted day and night by one persistent thought: I ought to be writing, I ought to be writing, I ought.", None),
            ("NINA", "But surely inspiration and the very act of creation must give you moments of exalted happiness?", None),
            ("TRIGORIN", "Yes, while I am writing it is pleasant enough. And reading the proofs is pleasant. But the moment a thing is published it becomes detestable to me; I see that it is wrong, all wrong.", None),
            ("NINA", "You are spoiled by success.", None),
            ("TRIGORIN", "What success? I have never pleased myself. I do not like myself as an author. The worst of it is that I am in a sort of daze, and often do not understand what I am writing.", None),
            ("NINA", "I should not mind the work and the worry, if only I could be famous. I would gladly sacrifice everything for that.", None),
            ("TRIGORIN", "Each of us writes as he wants to and as he can. Look, there is the moon rising, and I am thinking that I must remember to put it into a story.", None),
            ("NINA", "How strange it must be to feel so. I would give my whole life to stand where you stand.", None),
            ("TRIGORIN", "When people praise me I am pleased, and when they abuse me I am out of sorts for a day or two. But day and night I am held in the grip of one thought: there, I must write, I must write.", None),
            ("NINA", "Forgive me, I cannot understand you. You are simply too happy to know your own happiness.", None),
            ("TRIGORIN", "A young girl like you stands on the shore of a lake, and a seagull comes and is happy and free as you are. A man chances along, sees her, and, having nothing better to do, destroys her, just like that seagull.", None),
            ("NINA", "What do you mean?", None),
            ("TRIGORIN", "Nothing. It is only an idea for a short story.", None),
        ],
    )


def seed_pride_prejudice(db):
    play = _get_or_create_play(
        db, title="Pride and Prejudice", author="Jane Austen",
        genre="drama", category="classical", year_written=1813,
    )
    return _seed_scene(
        db, play=play,
        title="Pride and Prejudice — Darcy's First Proposal",
        act=None, scene_number=None,
        description="Mr. Darcy proposes to Elizabeth Bennet against his own better judgement, insulting her family in the same breath. She refuses him with cold fury. Adapted faithfully from Austen's prose into dialogue.",
        c1="ELIZABETH", c1_gender="female", c2="DARCY", c2_gender="male",
        difficulty="intermediate",
        primary_emotions=["indignation", "pride", "longing", "contempt"],
        relationship_dynamic="adversarial",
        tone="dramatic",
        setting="The parsonage drawing room at Hunsford",
        lines=[
            ("DARCY", "In vain have I struggled. It will not do. My feelings will not be repressed. You must allow me to tell you how ardently I admire and love you.", None),
            ("ELIZABETH", "Sir, I do not know how to express my refusal in such a way as may be sufficient to convince you of its being one.", None),
            ("DARCY", "And this is all the reply which I am to have the honour of expecting? I might wonder why, with so little endeavour at civility, I am thus rejected.", None),
            ("ELIZABETH", "I might as well inquire why, with so evident a desire of offending me, you chose to tell me that you liked me against your will, against your reason, and even against your character.", None),
            ("ELIZABETH", "But I have other provocations. You know I have. Why did you take it upon yourself to part Mr. Bingley from my sister?", None),
            ("DARCY", "I have no wish of denying that I did everything in my power to separate my friend from your sister, or that I rejoice in my success.", None),
            ("ELIZABETH", "But it is not merely this affair on which my dislike is founded. Long before it had taken place, my opinion of you was decided by your ungenerous treatment of Mr. Wickham.", None),
            ("DARCY", "You take an eager interest in that gentleman's concerns.", "with assumed tranquillity"),
            ("ELIZABETH", "Who that knows what his misfortunes have been can help feeling an interest in him?", None),
            ("DARCY", "His misfortunes! Yes, his misfortunes have been great indeed. And this is your opinion of me! I thank you for explaining it so fully.", None),
            ("ELIZABETH", "From the very beginning, your manners impressed me with the fullest belief of your arrogance, your conceit, and your selfish disdain of the feelings of others.", None),
            ("ELIZABETH", "I had not known you a month before I felt that you were the last man in the world whom I could ever be prevailed on to marry.", None),
            ("DARCY", "You have said quite enough, madam. I perfectly comprehend your feelings, and have now only to be ashamed of what my own have been. Forgive me for having taken up so much of your time.", None),
        ],
    )


def seed_much_ado(db):
    play = _get_or_create_play(
        db, title="Much Ado About Nothing", author="William Shakespeare",
        genre="comedy", category="classical", year_written=1599,
    )
    return _seed_scene(
        db, play=play,
        title="Much Ado About Nothing — Beatrice and Benedick",
        act="Act 1", scene_number="Scene 1",
        description="The famously sharp-tongued Beatrice and Benedick meet again and resume their merry war of wit, each insisting they will never love, never marry, and never lose a contest of words.",
        c1="BEATRICE", c1_gender="female", c2="BENEDICK", c2_gender="male",
        difficulty="intermediate",
        primary_emotions=["mockery", "delight", "pride", "attraction"],
        relationship_dynamic="rivals",
        tone="comedic",
        setting="Before Leonato's house in Messina",
        lines=[
            ("BEATRICE", "I wonder that you will still be talking, Signior Benedick: nobody marks you.", None),
            ("BENEDICK", "What, my dear Lady Disdain! are you yet living?", None),
            ("BEATRICE", "Is it possible disdain should die while she hath such meet food to feed it as Signior Benedick? Courtesy itself must convert to disdain, if you come in her presence.", None),
            ("BENEDICK", "Then is courtesy a turncoat. But it is certain I am loved of all ladies, only you excepted; and I would I could find in my heart that I had not a hard heart, for, truly, I love none.", None),
            ("BEATRICE", "A dear happiness to women: they would else have been troubled with a pernicious suitor. I thank God and my cold blood, I am of your humour for that. I had rather hear my dog bark at a crow than a man swear he loves me.", None),
            ("BENEDICK", "God keep your ladyship still in that mind! so some gentleman or other shall 'scape a predestinate scratched face.", None),
            ("BEATRICE", "Scratching could not make it worse, an 'twere such a face as yours were.", None),
            ("BENEDICK", "Well, you are a rare parrot-teacher.", None),
            ("BEATRICE", "A bird of my tongue is better than a beast of yours.", None),
            ("BENEDICK", "I would my horse had the speed of your tongue, and so good a continuer. But keep your way, i' God's name; I have done.", None),
            ("BEATRICE", "You always end with a jade's trick: I know you of old.", None),
            ("BENEDICK", "I will live in thy heart, die in thy lap, and be buried in thy eyes; and moreover I will go with thee to thy uncle's.", None),
            ("BEATRICE", "Speak you this with a sad brow? or do you play the flouting Jack, to tell us Cupid is a good hare-finder?", None),
            ("BENEDICK", "I do love nothing in the world so well as you: is not that strange?", None),
        ],
    )


def seed_trifles(db):
    play = _get_or_create_play(
        db, title="Trifles", author="Susan Glaspell",
        genre="drama", category="classical", year_written=1916,
    )
    return _seed_scene(
        db, play=play,
        title="Trifles — Mrs. Hale and Mrs. Peters",
        act=None, scene_number=None,
        description="While the men search the farmhouse for a motive in a murder, two women left in the kitchen quietly piece together the truth from the small domestic 'trifles' the men dismiss.",
        c1="MRS. HALE", c1_gender="female", c2="MRS. PETERS", c2_gender="female",
        difficulty="intermediate",
        primary_emotions=["sorrow", "guilt", "solidarity", "fear"],
        relationship_dynamic="allies",
        tone="dramatic",
        setting="The gloomy kitchen of the abandoned Wright farmhouse",
        lines=[
            ("MRS. HALE", "I'd hate to have men coming into my kitchen, snooping around and criticising.", None),
            ("MRS. PETERS", "Of course it's no more than their duty.", None),
            ("MRS. HALE", "Duty's all right, but I guess that deputy sheriff that came out to make the fire might have got a little of this on. Wright was close.", None),
            ("MRS. PETERS", "She had bread set.", "examining the bread"),
            ("MRS. HALE", "She was going to put this in there. It's a shame about her fruit. I wonder if it's all gone.", None),
            ("MRS. PETERS", "Here's a bird-cage. Did she have a bird, Mrs. Hale?", None),
            ("MRS. HALE", "Why, I don't know whether she did or not—I've not been here for so long. There was a man around last year selling canaries cheap, but I don't know as she took one.", None),
            ("MRS. PETERS", "Look at this door. It's broke. One hinge is pulled apart.", None),
            ("MRS. HALE", "Looks as if someone must have been rough with it.", None),
            ("MRS. PETERS", "Why, here's the bird. But, Mrs. Hale, look at it! Its neck. Look at its neck. It's all—other side to.", "lifting the silk"),
            ("MRS. HALE", "Somebody wrung its neck.", None),
            ("MRS. PETERS", "We don't know who killed the bird.", None),
            ("MRS. HALE", "I knew John Wright. If they'd take a bird that sang, and silence it, I think I know what stillness is.", None),
            ("MRS. PETERS", "We mustn't take on. We don't know who killed him. We don't know.", None),
            ("MRS. HALE", "Oh, I wish I'd come over here once in a while! That was a crime! Who's going to punish that?", None),
        ],
    )


def seed_cyrano(db):
    play = _get_or_create_play(
        db, title="Cyrano de Bergerac", author="Edmond Rostand",
        genre="drama", category="classical", year_written=1897,
    )
    return _seed_scene(
        db, play=play,
        title="Cyrano de Bergerac — The Balcony in the Dark",
        act="Act 3", scene_number=None,
        description="Hidden in shadow beneath Roxane's balcony, Cyrano lends his own voice to the handsome but tongue-tied Christian, pouring out his true love under another man's name. From Gladys Thomas's public-domain translation.",
        c1="CYRANO", c1_gender="male", c2="ROXANE", c2_gender="female",
        difficulty="advanced",
        primary_emotions=["love", "longing", "anguish", "tenderness"],
        relationship_dynamic="romantic",
        tone="romantic",
        setting="A little square in the old Marais, beneath Roxane's balcony, night",
        lines=[
            ("ROXANE", "You are slow at speaking. Why?", None),
            ("CYRANO", "It is so dark that I am feeling my way toward your heart, and fear to lose the road.", "speaking low, as Christian"),
            ("ROXANE", "My words go not so blindly.", None),
            ("CYRANO", "They reach you straight, because that is their home; but mine must climb, and that takes time.", None),
            ("ROXANE", "Yet you climb better than just now.", None),
            ("CYRANO", "Because my heart at last has grown accustomed to the heights.", None),
            ("ROXANE", "I scarce can hear you. You are far below.", None),
            ("CYRANO", "Let me climb up into the kindly dark where none can see, and I may speak at last as my own self.", None),
            ("ROXANE", "As your own self?", None),
            ("CYRANO", "Yes! All this while I have been trembling, fearing, doubting—now in the dark I dare to be sincere. A kiss—what is it? A rosy dot placed on the 'i' in loving; a secret that takes the lips for ear.", None),
            ("ROXANE", "Hush!", None),
            ("CYRANO", "A kiss is so noble a thing that the Queen of France let a most favored lord taste it—the Queen herself!", None),
            ("ROXANE", "If that be so—", None),
            ("CYRANO", "I, like Buckingham, have suffered mutely, like him adore a queen as you are; like him am faithful and sad.", None),
        ],
    )


def seed_taming_shrew(db):
    play = _get_or_create_play(
        db, title="The Taming of the Shrew", author="William Shakespeare",
        genre="comedy", category="classical", year_written=1592,
    )
    return _seed_scene(
        db, play=play,
        title="The Taming of the Shrew — Petruchio Woos Katherina",
        act="Act 2", scene_number="Scene 1",
        description="Petruchio meets the sharp-tongued Katherina for the first time and announces he intends to marry her, matching her every insult with relentless, teasing charm.",
        c1="PETRUCHIO", c1_gender="male", c2="KATHERINA", c2_gender="female",
        difficulty="intermediate",
        primary_emotions=["defiance", "amusement", "anger", "attraction"],
        relationship_dynamic="adversarial",
        tone="comedic",
        setting="A room in Baptista's house in Padua",
        lines=[
            ("PETRUCHIO", "Good morrow, Kate; for that's your name, I hear.", None),
            ("KATHERINA", "Well have you heard, but something hard of hearing: they call me Katharine that do talk of me.", None),
            ("PETRUCHIO", "You lie, in faith; for you are call'd plain Kate, and bonny Kate, and sometimes Kate the curst; but Kate, the prettiest Kate in Christendom.", None),
            ("KATHERINA", "Mov'd! in good time: let him that mov'd you hither remove you hence. I knew you at the first you were a moveable.", None),
            ("PETRUCHIO", "Why, what's a moveable?", None),
            ("KATHERINA", "A join'd-stool.", None),
            ("PETRUCHIO", "Thou hast hit it: come, sit on me.", None),
            ("KATHERINA", "Asses are made to bear, and so are you.", None),
            ("PETRUCHIO", "Women are made to bear, and so are you.", None),
            ("KATHERINA", "No such jade as you, if me you mean.", None),
            ("PETRUCHIO", "Come, come, you wasp; i' faith, you are too angry.", None),
            ("KATHERINA", "If I be waspish, best beware my sting.", None),
            ("PETRUCHIO", "My remedy is then, to pluck it out.", None),
            ("KATHERINA", "Ay, if the fool could find it where it lies.", None),
            ("PETRUCHIO", "Setting all this chat aside, thus in plain terms: your father hath consented that you shall be my wife; and, will you, nill you, I will marry you.", None),
        ],
    )


def seed_hedda(db):
    play = _get_or_create_play(
        db, title="Hedda Gabler", author="Henrik Ibsen",
        genre="drama", category="classical", year_written=1891,
    )
    return _seed_scene(
        db, play=play,
        title="Hedda Gabler — Hedda and Lovborg",
        act="Act 2", scene_number=None,
        description="Hedda confronts Eilert Lovborg, the brilliant, self-destructive man she once almost loved. Beneath their guarded courtesy lies a dangerous history of confession and cruelty.",
        c1="HEDDA", c1_gender="female", c2="LOVBORG", c2_gender="male",
        difficulty="advanced",
        primary_emotions=["control", "regret", "tension", "cruelty"],
        relationship_dynamic="former-lovers",
        tone="dramatic",
        setting="The Tesmans' drawing room",
        lines=[
            ("LOVBORG", "Hedda—Gabler!", "in a low voice"),
            ("HEDDA", "Hush! That was my name in the old days—when we two knew each other.", None),
            ("LOVBORG", "And must I henceforth never say Hedda Gabler?", None),
            ("HEDDA", "No. It is too late. You must accustom yourself to call me Mrs. Tesman.", None),
            ("LOVBORG", "Hedda Gabler married? And to George Tesman!", None),
            ("HEDDA", "Yes—so the world goes.", None),
            ("LOVBORG", "Oh, Hedda, Hedda—how could you throw yourself away so?", None),
            ("HEDDA", "What? I can't allow this! You have no right to talk to me like that.", "looks sharply at him"),
            ("LOVBORG", "What do you mean? Did you not love me? When I used to come to your father's in the afternoon, and we sat in the corner and read the papers together?", None),
            ("HEDDA", "We always had the same illustrated paper before us.", None),
            ("LOVBORG", "What was it, then, that made you break off so suddenly? Was it not love?", None),
            ("HEDDA", "There was something beautiful, something fascinating—something daring—in that secret intimacy, that comradeship which no living creature so much as dreamed of.", None),
            ("LOVBORG", "Why did you not shoot me down, as you threatened?", None),
            ("HEDDA", "Because I have such a dread of scandal.", None),
            ("LOVBORG", "Yes, Hedda, you are a coward at heart.", None),
        ],
    )


def seed_midsummer(db):
    play = _get_or_create_play(
        db, title="A Midsummer Night's Dream", author="William Shakespeare",
        genre="comedy", category="classical", year_written=1596,
    )
    return _seed_scene(
        db, play=play,
        title="A Midsummer Night's Dream — Helena Pursues Demetrius",
        act="Act 2", scene_number="Scene 1",
        description="Lost in the enchanted wood, the devoted Helena chases Demetrius, who scorns her at every turn. She refuses to be shaken off, declaring herself his faithful spaniel.",
        c1="HELENA", c1_gender="female", c2="DEMETRIUS", c2_gender="male",
        difficulty="beginner",
        primary_emotions=["devotion", "desperation", "scorn", "longing"],
        relationship_dynamic="unrequited",
        tone="comedic",
        setting="A moonlit wood near Athens",
        lines=[
            ("DEMETRIUS", "I love thee not, therefore pursue me not. Where is Lysander and fair Hermia? The one I'll slay, the other slayeth me.", None),
            ("HELENA", "You draw me, you hard-hearted adamant; but yet you draw not iron, for my heart is true as steel.", None),
            ("DEMETRIUS", "Do I entice you? do I speak you fair? Or, rather, do I not in plainest truth tell you I do not, nor I cannot love you?", None),
            ("HELENA", "And even for that do I love you the more. I am your spaniel; and, Demetrius, the more you beat me, I will fawn on you.", None),
            ("DEMETRIUS", "Tempt not too much the hatred of my spirit; for I am sick when I do look on thee.", None),
            ("HELENA", "And I am sick when I look not on you.", None),
            ("DEMETRIUS", "You do impeach your modesty too much, to leave the city and commit yourself into the hands of one that loves you not.", None),
            ("HELENA", "Your virtue is my privilege. It is not night when I do see your face, therefore I think I am not in the night.", None),
            ("DEMETRIUS", "I'll run from thee and hide me in the brakes, and leave thee to the mercy of wild beasts.", None),
            ("HELENA", "The wildest hath not such a heart as you. Run when you will, the story shall be changed: Apollo flies, and Daphne holds the chase.", None),
            ("DEMETRIUS", "I will not stay thy questions; let me go: or, if thou follow me, do not believe but I shall do thee mischief in the wood.", None),
            ("HELENA", "Ay, in the temple, in the town, the field, you do me mischief. Fie, Demetrius! Your wrongs do set a scandal on my sex.", None),
            ("HELENA", "We cannot fight for love, as men may do; we should be woo'd and were not made to woo. I'll follow thee and make a heaven of hell, to die upon the hand I love so well.", None),
        ],
    )


def seed_antony_cleopatra(db):
    play = _get_or_create_play(
        db, title="Antony and Cleopatra", author="William Shakespeare",
        genre="tragedy", category="classical", year_written=1607,
    )
    return _seed_scene(
        db, play=play,
        title="Antony and Cleopatra — The Quarrel of Lovers",
        act="Act 1", scene_number="Scene 1",
        description="Cleopatra needles Antony as news arrives from Rome, testing the strength of his love against the pull of empire. Antony declares the world well lost for her.",
        c1="CLEOPATRA", c1_gender="female", c2="ANTONY", c2_gender="male",
        difficulty="advanced",
        primary_emotions=["passion", "jealousy", "defiance", "devotion"],
        relationship_dynamic="romantic",
        tone="dramatic",
        setting="A room in Cleopatra's palace in Alexandria",
        lines=[
            ("CLEOPATRA", "If it be love indeed, tell me how much.", None),
            ("ANTONY", "There's beggary in the love that can be reckon'd.", None),
            ("CLEOPATRA", "I'll set a bourn how far to be beloved.", None),
            ("ANTONY", "Then must thou needs find out new heaven, new earth.", None),
            ("CLEOPATRA", "The news, my lord, from Rome. Nay, hear them, Antony: Fulvia perchance is angry; or who knows if the scarce-bearded Caesar have not sent his powerful mandate to you.", None),
            ("ANTONY", "How, my love?", None),
            ("CLEOPATRA", "Perchance! nay, and most like: you must not stay here longer; your dismission is come from Caesar; therefore hear it, Antony.", None),
            ("ANTONY", "Let Rome in Tiber melt, and the wide arch of the ranged empire fall! Here is my space. Kingdoms are clay.", None),
            ("CLEOPATRA", "Excellent falsehood! Why did he marry Fulvia, and not love her? I'll seem the fool I am not; Antony will be himself.", None),
            ("ANTONY", "But stirr'd by Cleopatra. Now, for the love of Love and her soft hours, let's not confound the time with conference harsh.", None),
            ("CLEOPATRA", "Hear the ambassadors.", None),
            ("ANTONY", "Fie, wrangling queen! Whom every thing becomes, to chide, to laugh, to weep; whose every passion fully strives to make itself, in thee, fair and admired!", None),
            ("CLEOPATRA", "Last night you did desire it. Speak not to us.", None),
            ("ANTONY", "There's not a minute of our lives should stretch without some pleasure now. What sport tonight?", None),
        ],
    )


def seed_oedipus(db):
    play = _get_or_create_play(
        db, title="Oedipus the King", author="Sophocles",
        genre="tragedy", category="classical", year_written=-429,
    )
    return _seed_scene(
        db, play=play,
        title="Oedipus the King — Oedipus and Jocasta",
        act=None, scene_number=None,
        description="As the truth of the prophecy closes in, Jocasta tries to soothe Oedipus's mounting dread, only to deepen it. The closer she steers him from fear, the nearer he comes to the unbearable truth.",
        c1="OEDIPUS", c1_gender="male", c2="JOCASTA", c2_gender="female",
        difficulty="advanced",
        primary_emotions=["dread", "denial", "anguish", "fear"],
        relationship_dynamic="familial",
        tone="tragic",
        setting="Before the royal palace of Thebes",
        lines=[
            ("JOCASTA", "Why have you sent for me from out the house? Tell me, what is it troubles you so sorely?", None),
            ("OEDIPUS", "I will tell you. A messenger is come from Corinth, saying that my father Polybus is dead.", None),
            ("JOCASTA", "How say you? Let the messenger himself declare it.", None),
            ("OEDIPUS", "He says my father is no more, that age and sickness laid him in his grave.", None),
            ("JOCASTA", "Where now are all those prophecies we feared? You were to slay your father. He is dead, and you, you never touched him. Fortune rules.", None),
            ("OEDIPUS", "You reason well, and yet I cannot but be troubled while my mother is alive.", None),
            ("JOCASTA", "Why should man fear, since chance is all in all for him, and he can clearly foreknow nothing? Best to live carelessly, as best one may.", None),
            ("OEDIPUS", "All that were true, if my mother were not living. But while she lives I must be full of fears.", None),
            ("JOCASTA", "Yet your father's death is a great light of comfort.", None),
            ("OEDIPUS", "Great, I know; but I fear her who is still alive.", None),
            ("JOCASTA", "Nay, fear not. Many men ere now have dreamt that they have shared their mother's bed. But he to whom these things are nothing bears his life most easily.", None),
            ("OEDIPUS", "All bravely spoken, were she not living still. But since she lives, though brave your words, I dread.", None),
            ("JOCASTA", "And yet your father's grave is a great eye of comfort.", None),
            ("OEDIPUS", "Great, I grant you. But I fear the living.", None),
        ],
    )


def seed_twelfth_night(db):
    play = _get_or_create_play(
        db, title="Twelfth Night", author="William Shakespeare",
        genre="comedy", category="classical", year_written=1602,
    )
    return _seed_scene(
        db, play=play,
        title="Twelfth Night — Viola and Olivia",
        act="Act 1", scene_number="Scene 5",
        description="Disguised as the page Cesario, Viola comes to woo Olivia on Duke Orsino's behalf. Olivia, unmoved by the Duke, finds herself unexpectedly drawn to the messenger.",
        c1="VIOLA", c1_gender="female", c2="OLIVIA", c2_gender="female",
        difficulty="intermediate",
        primary_emotions=["wit", "fascination", "pride", "yearning"],
        relationship_dynamic="courtship",
        tone="comedic",
        setting="A room in Olivia's house in Illyria",
        lines=[
            ("VIOLA", "Most radiant, exquisite and unmatchable beauty—I pray you, tell me if this be the lady of the house, for I never saw her.", None),
            ("OLIVIA", "If I do not usurp myself, I am.", None),
            ("VIOLA", "Most certain, if you are she, you do usurp yourself; for what is yours to bestow is not yours to reserve. But this is from my commission.", None),
            ("OLIVIA", "Come to what is important in't: I forgive you the praise.", None),
            ("VIOLA", "Alas, I took great pains to study it, and 'tis poetical.", None),
            ("OLIVIA", "It is the more like to be feigned: I pray you, keep it in. Are you a comedian?", None),
            ("VIOLA", "No, my profound heart: and yet, by the very fangs of malice I swear, I am not that I play.", None),
            ("OLIVIA", "Why, what would you?", None),
            ("VIOLA", "Make me a willow cabin at your gate, and call upon my soul within the house; write loyal cantons of contemned love and sing them loud even in the dead of night.", None),
            ("OLIVIA", "You might do much. What is your parentage?", None),
            ("VIOLA", "Above my fortunes, yet my state is well: I am a gentleman.", None),
            ("OLIVIA", "Get you to your lord. I cannot love him: let him send no more—unless, perchance, you come to me again, to tell me how he takes it.", None),
            ("OLIVIA", "'What is your parentage?' 'Above my fortunes, yet my state is well: I am a gentleman.' I'll be sworn thou art.", "to herself"),
            ("VIOLA", "I am no fee'd post, lady; keep your purse: my master, not myself, lacks recompense. Farewell, fair cruelty.", None),
        ],
    )


def seed_jane_eyre(db):
    play = _get_or_create_play(
        db, title="Jane Eyre", author="Charlotte Brontë",
        genre="drama", category="classical", year_written=1847,
    )
    return _seed_scene(
        db, play=play,
        title="Jane Eyre — Jane and Rochester in the Garden",
        act=None, scene_number=None,
        description="In the orchard at Thornfield, Rochester goads Jane into believing he will marry another and send her away. Jane breaks her composure and declares her equal heart. Adapted faithfully from Brontë's prose.",
        c1="JANE", c1_gender="female", c2="ROCHESTER", c2_gender="male",
        difficulty="intermediate",
        primary_emotions=["grief", "indignation", "love", "pride"],
        relationship_dynamic="romantic",
        tone="dramatic",
        setting="The orchard at Thornfield Hall on a midsummer evening",
        lines=[
            ("ROCHESTER", "You must have become in some degree attached to the house. And you will be sorry to part with it?", None),
            ("JANE", "I grieve to leave Thornfield: I love Thornfield. I have known what it is to live with what I reverence, with what I delight in, with an original, a vigorous, an expanded mind.", None),
            ("ROCHESTER", "Where do you see the necessity? Necessity compels me to go, and that is enough.", None),
            ("JANE", "It strikes me with terror and anguish to feel I absolutely must be torn from you for ever.", None),
            ("ROCHESTER", "And must I leave you so soon? Must I lose my one friend?", None),
            ("JANE", "Do you think I can stay to become nothing to you? Do you think I am an automaton?—a machine without feelings? Do you think, because I am poor, obscure, plain, and little, I am soulless and heartless?", None),
            ("JANE", "You think wrong! I have as much soul as you, and full as much heart!", None),
            ("ROCHESTER", "As we are!", "gathering her to his heart"),
            ("JANE", "It is my spirit that addresses your spirit; just as if both had passed through the grave, and we stood at God's feet, equal—as we are!", None),
            ("ROCHESTER", "Jane, be still; don't struggle so, like a wild frantic bird that rends its own plumage in its desperation.", None),
            ("JANE", "I am no bird; and no net ensnares me: I am a free human being with an independent will, which I now exert to leave you.", None),
            ("ROCHESTER", "And your will shall decide your destiny. I offer you my hand, my heart. Jane, will you marry me?", None),
            ("JANE", "Are you in earnest? Do you truly love me? Do you sincerely wish me to be your wife?", None),
            ("ROCHESTER", "I do; and if an oath is necessary to satisfy you, I swear it.", None),
        ],
    )


# ============================================================================
# Top-level seeder
# ============================================================================

SEEDERS = [
    seed_romeo_juliet,
    seed_macbeth,
    seed_earnest,
    seed_dolls_house,
    seed_the_seagull,
    seed_pride_prejudice,
    seed_much_ado,
    seed_trifles,
    seed_cyrano,
    seed_taming_shrew,
    seed_hedda,
    seed_midsummer,
    seed_antony_cleopatra,
    seed_oedipus,
    seed_twelfth_night,
    seed_jane_eyre,
]


def seed_library_scenes():
    db = SessionLocal()
    seeded = 0
    skipped = 0
    try:
        print(f"Seeding scene library ({len(SEEDERS)} scenes)...")
        for seeder in SEEDERS:
            if seeder(db):
                seeded += 1
            else:
                skipped += 1
        db.commit()
        print(f"\nDone. {seeded} scene(s) seeded, {skipped} skipped (already present).")
    except Exception as e:
        db.rollback()
        print(f"Error seeding scene library: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_library_scenes()
