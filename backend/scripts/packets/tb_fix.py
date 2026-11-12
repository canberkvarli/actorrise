import json, re, sys
sys.path.insert(0,"pk")
M={ # title-prefix (casefold) -> (canonical title, author, year, floor?, genre)
"a piece of my heart":("A Piece of My Heart","Shirley Lauro",1991,0,"drama"),"about a goth":("About a Goth","Tom Wells",2009,0,"drama"),
"angels in america":("Angels in America","Tony Kushner",1991,0,"drama"),"august, osage county":("August: Osage County","Tracy Letts",2007,0,"drama"),
"before it hits home":("Before It Hits Home","Cheryl L. West",1989,0,"drama"),"dancing bears":("Dancing Bears","Sam Holcroft",2010,1,"drama"),
"dark earth":("Dark Earth","David Harrower",2003,0,"drama"),"eigengrau":("Eigengrau","Penelope Skinner",2010,0,"drama"),
"extremities":("Extremities","William Mastrosimone",1982,0,"drama"),"fat men in skirts":("Fat Men in Skirts","Nicky Silver",1988,0,"drama"),
"fen":("Fen","Caryl Churchill",1983,0,"drama"),"fun home":("Fun Home","Lisa Kron",2013,0,"musical"),
"gilt":("Gilt","Stephen Greenhorn, Rona Munro and Isabel Wright",2003,0,"drama"),"how love is spelt":("How Love Is Spelt","Chloe Moss",2004,0,"drama"),
"i never saw another butterfly":("I Never Saw Another Butterfly","Celeste Raspanti",1971,0,"drama"),
"in the next room":("In the Next Room (Or the Vibrator Play)","Sarah Ruhl",2009,0,"drama"),"inherit the wind":("Inherit the Wind","Jerome Lawrence and Robert E. Lee",1955,0,"drama"),
"last days of judas iscariot":("The Last Days of Judas Iscariot","Stephen Adly Guirgis",2005,0,"drama"),"little gem":("Little Gem","Elaine Murphy",2008,0,"drama"),
"lives of the great waitresses":("Lives of the Great Waitresses","Nina Shengold",1989,1,"drama"),"looking for normal":("Looking for Normal","Jane Anderson",2001,0,"drama"),
"loose knit":("Loose Knit","Theresa Rebeck",1993,0,"drama"),"marisol":("Marisol","José Rivera",1992,0,"drama"),
"naomi in the living room":("Naomi in the Living Room","Christopher Durang",1988,0,"drama"),"one for sorrow":("One for Sorrow","Cordelia Lynn",2018,0,"drama"),
"polaroid stories":("Polaroid Stories","Naomi Iizuka",1997,0,"drama"),"references to salvador dali":("References to Salvador Dalí Make Me Hot","José Rivera",2000,0,"drama"),
"scab":("Scab","Sheila Callaghan",2002,0,"drama"),"silent sky":("Silent Sky","Lauren Gunderson",2011,0,"drama"),"smoke":("Smoke","Kim Davies",2014,0,"drama"),
"smoking lesson":("Smoking Lesson","Julia Jordan",1998,1,"drama"),"stop kiss":("Stop Kiss","Diana Son",1998,0,"drama"),
"the cripple of inishmaan":("The Cripple of Inishmaan","Martin McDonagh",1996,0,"drama"),"the diary of anne frank":("The Diary of Anne Frank","Frances Goodrich and Albert Hackett",1955,0,"drama"),
"the food chain":("The Food Chain","Nicky Silver",1995,0,"drama"),"the gut girls":("The Gut Girls","Sarah Daniels",1988,0,"drama"),
"the metal children":("The Metal Children","Adam Rapp",2010,0,"drama"),"the monstrous heart":("The Monstrous Heart","Oliver Emanuel",2019,0,"drama"),
"the vagina monologues":("The Vagina Monologues","Eve Ensler",1996,0,"drama"),"the whale":("The Whale","Samuel D. Hunter",2012,0,"drama"),
"three tall women":("Three Tall Women","Edward Albee",1991,0,"drama"),"tongue of a bird":("Tongue of a Bird","Ellen McLaughlin",1997,0,"drama"),
"touch":("Touch","Toni Press-Coffman",2000,1,"drama"),"venus in fur":("Venus in Fur","David Ives",2010,0,"drama"),"vinegar tom":("Vinegar Tom","Caryl Churchill",1976,0,"drama"),
"wasted":("Wasted","Kae Tempest",2011,0,"drama"),"yellowman":("Yellowman","Dael Orlandersmith",2002,0,"drama"),"chicago":("Chicago","Fred Ebb and Bob Fosse",1975,0,"musical"),
"anne boleyn":("Anne Boleyn","Howard Brenton",2010,0,"drama"),"the eccentricities of a nightingale":("The Eccentricities of a Nightingale","Tennessee Williams",1964,0,"drama"),
"a streetcar name desire":("A Streetcar Named Desire","Tennessee Williams",1947,0,"drama"),
"mint julep":("Mint Juleps","Nick Zagone",2000,1,"drama"),"the coors light":("The Coors Light","Nick Zagone",2000,1,"drama"),"the long island iced tea":("The Long Island Iced Tea","Nick Zagone",2000,1,"drama"),
"the pink fancy":("The Pink Fancy","Nick Zagone",2000,1,"drama"),"the salmon tribunal":("The Salmon Tribunal","Walter Wykes",2000,1,"drama"),"the unwanted":("The Unwanted","Walter Wykes",2000,1,"drama"),
"bush dreams":("Bush Dreams","Walter Wykes",2000,1,"drama")}
KNOWN={"pterodactyls","burn this","suburbia","the crucible","fences","top girls","cloud nine","a raisin in the sun","the glass menagerie","our town","death of a salesman","cat on a hot tin roof","a streetcar named desire","long day's journey into night","eurydice","rabbit hole","doubt: a parable","proof","crimes of the heart","the piano lesson","red","honour","bull","boys","august: osage county"}
src=json.load(open("pk/pdf/tumblr.json")); out=[]; ys={}
for p in src:
    key=p["play_title"].casefold(); hit=next((v for k,v in M.items() if key.startswith(k)),None)
    if hit:
        p["play_title"],p["author"],y,fl,g=hit; p["genre"]=g; ys[p["play_title"]]=(y,fl)
        if len(p["character"])<=1 and p["play_title"]=="Three Tall Women": pass
        out.append(p)
    elif key in KNOWN and len(p["author"].split())>=2: out.append(p)
json.dump({"source":"Tumblr monologue archives (themonologuearchive, fuckyeahgreatmonologues, monologue-database)","source_url":"","pieces":out},open("man/tumblr.json","w"),ensure_ascii=False,indent=1)
p='/home/user/actorrise/backend/data/contemporary_play_years.json'; d=json.load(open(p)); low={k.casefold() for k in d}; n=0
for t,(y,fl) in ys.items():
    if t.casefold() not in low:
        d[t]={"year":y,"source":("FLOOR, not a premiere: exact first production year not known to the editor; no earlier than this. Era banding only." if fl else "First production year, compiled 2026-11-12 from premiere records known to the editor; used to band the era only. Confirm before relying on the exact year."),"verified":False}; n+=1
json.dump(d,open(p,'w'),indent=2,ensure_ascii=False); open(p,'a').write("\n"); print(len(out),"pieces; years added",n)
