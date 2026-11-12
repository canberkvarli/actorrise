import requests, time, subprocess, os
s=requests.Session(); s.headers.update({"User-Agent":"ActorRise/1.0 (audition-prep; monologue-curation)"})
U={
"nida25":"https://www.nida.edu.au/wp-content/uploads/Monologue-List_2025_final_v2.pdf",
"nida23":"https://www.nida.edu.au/wp-content/uploads/ACTING_Monologue-List_2023.pdf",
"laine":"https://www.laine-theatre-arts.co.uk/wp-content/uploads/2025/11/MONOLOGUES-26-ENTRY-.pdf",
"dawson_f":"https://www.dawsoncollege.qc.ca/professional-theatre/wp-content/uploads/sites/11/monologues_contemporary_female.pdf",
"dawson_m":"https://www.dawsoncollege.qc.ca/professional-theatre/wp-content/uploads/sites/11/monologues_contemporary_male.pdf",
"sct":"https://www.sct.org/app/uploads/2018/10/Monologue-Packet-2019.pdf",
"vca":"https://vadastudios.com/wp-content/uploads/2023/10/Contemporary-Monologues.pdf",
"village":"https://villagetheatre.org/wp-content/uploads/2020/07/Audition_Monologues.pdf",
"ca_f24":"https://www.charterarts.org/wp-content/uploads/2024/06/2024-2025-Female-Audition-Monologues.pdf",
"ca_m24":"https://www.charterarts.org/wp-content/uploads/2024/06/2024-2025-Male-Audition-Monologues.pdf",
"ca_f19":"https://www.charterarts.org/wp-content/uploads/2019/11/Female-Audition-Monologues-2019-2020.pdf",
"ca_m20":"https://www.charterarts.org/wp-content/uploads/2019/11/Male-Audition-Monologues-2020-2021.pdf",
"ca_m14":"https://www.charterarts.org/wp-content/uploads/2014/10/Revised-Male-Monologues.pdf",
"ca_f13":"https://www.charterarts.org/wp-content/uploads/2011/10/Theatre-FemaleAudition13-14.pdf",
"cab":"https://www.cabcallowayschool.org/wp-content/uploads/2018/06/HS-THEATRE-ASSESMENT-MONOLOGUES.pdf",
"newark":"https://www.nps.k12.nj.us/ART/wp-content/uploads/sites/104/2022/11/2023-Arts-High-School-Drama-Audition-Monologue-Bank.pdf",
"lhs_f":"https://lhstheatredept.weebly.com/uploads/1/1/9/0/119047293/female_monologues.pdf",
}
for k,u in U.items():
    p=f"pk/pdf/{k}.pdf"
    if not os.path.exists(p):
        try:
            r=s.get(u,timeout=60)
            if r.status_code!=200 or r.content[:4]!=b"%PDF": print(k,"FAIL",r.status_code); continue
            open(p,"wb").write(r.content)
        except Exception as e: print(k,"ERR",str(e)[:80]); continue
        time.sleep(1)
    subprocess.run(["pdftotext","-layout",p,f"pk/pdf/{k}.txt"])
    t=open(f"pk/pdf/{k}.txt",errors="replace").read(); print(k,len(t.split()),"words")
