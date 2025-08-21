const listeningTopics = [
    {
      "id": 1,
      "title": "First Day at a New Job",
      "category": "Jobs and Workplace",
      "audio": "topic_1",
      "characters": [
        {
          "name": "Rafiq",
          "role": "New Employee"
        },
        {
          "name": "Sarah",
          "role": "Team Lead"
        }
      ],
      "conversation": "Sarah: Hey Rafiq! Welcome to the team. How's your first day going so far?\nRafiq: Hi Sarah! Thanks for the warm welcome. It's going well, but I'm still trying to get the hang of everything. It's a lot to take in on the first day.\nSarah: Oh, I completely get that. My first day was a total whirlwind. Don't worry, no one expects you to have it all figured out right away. The main goal for this week is just for you to get settled in and meet everyone.\nRafiq: That's a relief to hear. I've met a few people from the marketing team, and everyone seems really friendly.\nSarah: They are a great bunch. This afternoon, I've blocked out some time to walk you through our project management software, Asana. That's the main tool we use to keep track of all our tasks and deadlines.\nRafiq: Perfect. I've used it a little bit in my previous role, so I'm somewhat familiar with it. What's the top priority for me to learn in my first week?\nSarah: Good question. I'd say focus on understanding our workflow. I'll show you the ropes, of course. We'll go over some of our past projects so you can see how we take an idea from the initial concept all the way to launch. It'll give you a good bird's-eye view of how we operate.\nRafiq: That sounds like a great way to get up to speed. Is there any documentation I should read?\nSarah: Yes, I've sent you an email with a link to our team's folder on the shared drive. You'll find brand guidelines, style guides, and some important onboarding documents in there. Just go through them whenever you have some downtime. Don't feel pressured to memorize everything at once.\nRafiq: Got it. Thanks for all the guidance, Sarah. I appreciate it. It makes starting a new job feel a lot less intimidating.\nSarah: Of course! We're all here to help you succeed. Feel free to reach out to me or anyone else on the team if you have questions. Seriously, there's no such thing as a stupid question, especially in your first few weeks. Now, how about we grab a coffee from the kitchen before we dive into Asana?\nRafiq: I would love that. Lead the way!"
    },
    {
      "id": 2,
      "title": "Discussing a Project Deadline",
      "category": "Jobs and Workplace",
      "audio": "topic_2",
      "characters": [
        {
          "name": "Maria",
          "role": "Project Manager"
        },
        {
          "name": "Ben",
          "role": "Developer"
        }
      ],
      "conversation": "Maria: Hi Ben, have you got a minute? I wanted to touch base about the quarterly report project.\nBen: Sure, Maria. Come on in. What's up?\nMaria: I was just looking at the project timeline, and I'm a little concerned we might not hit our deadline at the end of the month. It seems like the data integration phase is taking longer than we anticipated.\nBen: Yeah, you're not wrong about that. We ran into a few unexpected issues with the old database. It's a bit of a mess, to be honest. The system is much more outdated than we first thought, so we've had to work around a lot of its quirks.\nMaria: I see. I had a feeling that might be the case. So, what's your take on the situation? Realistically, how much more time do you think your team needs to get everything ironed out?\nBen: Well, we're making progress, but it's slow going. I think if we want to do it right and make sure the data is clean, we could probably use another week. I know that's not ideal.\nMaria: An extra week… hmm. That's going to be tight. The leadership team is really looking forward to seeing this report in the Q3 review meeting. Pushing it back would be a last resort.\nBen: I completely get that. Another option is that we could pull in some extra help. Maybe get Priya from the analytics team to lend a hand? She's a wizard with legacy systems. She could probably help us speed things up significantly.\nMaria: That's a great idea. I didn't even think of that. Do you think she'd be available to jump in?\nBen: I can definitely reach out to her. I think if we explain the situation, her manager will be on board. It's a high-priority project for everyone. We'll just have to make a strong case for it.\nMaria: Okay, let's do that. You talk to Priya and her manager, and I'll rearrange some of our other smaller tasks to free up more of your team's time for this. We need to go all in on this for the next couple of weeks.\nBen: Sounds like a plan. I'll let you know what Priya says by the end of the day. I'm feeling a bit more optimistic now. I think we can pull it off.\nMaria: Me too. Thanks for being upfront about the challenges, Ben. It's much better to deal with this now than to wait until the last minute. Let's stay on top of it.\nBen: Absolutely. We'll get it done."
    },
    {
      "id": 3,
      "title": "The Fear and Joy of Changing Careers",
      "category": "Jobs and Workplace",
      "audio": "topic_3",
      "characters": [
        {
          "name": "David",
          "role": "Speaker"
        }
      ],
      "conversation": "David: Have you ever felt like you're stuck in a rut? You know, you're good at your job, the pay is decent, but you wake up every morning with this nagging feeling that you're on the wrong path. That was me about two years ago. I was an accountant. And let me tell you, I was a good accountant. But was I passionate about it? Not even close.\nEvery day felt the same. Spreadsheets, reports, meetings about financial projections… I felt like a robot. The spark was just gone. I bet some of you know what I'm talking about, right? That feeling when your Sunday evenings are filled with dread for the week ahead?\nThe scariest part was admitting that I wanted to make a change. I was in my early thirties, I had a stable career… walking away from that felt like madness. What would people think? What if I failed? My mind was flooded with doubts. I spent months just thinking about it, too afraid to take the leap.\nWhat would you do in that situation? Would you play it safe or risk it all for a chance at happiness?\nWell, one day I just decided I couldn't do it anymore. I bit the bullet. I started taking online courses in graphic design at night after my day job. At first, it was exhausting. I was burning the candle at both ends. But for the first time in years, I felt excited. I was creating things, learning something new, and using a different part of my brain.\nIt took me over a year to build up a portfolio and gain enough confidence to start applying for junior designer jobs. I got a lot of rejections. It was tough, and there were moments I thought about giving up and going back to the safety of accounting. But I pushed through.\nAnd then, I got an offer. It was for less money than I was making before, and it was an entry-level position. But I took it. And I have never, ever regretted it. The feeling of doing work that you actually love is indescribable. It changed everything—my mood, my energy, my outlook on life. It was a blessing in disguise. So if you're feeling stuck, my advice is to just start exploring. You don't have to quit your job tomorrow, but just take one small step towards something that interests you. You never know where it might lead."
    },
    {
      "id": 4,
      "title": "A Difficult Performance Review",
      "category": "Jobs and Workplace",
      "audio": "topic_4",
      "characters": [
        {
          "name": "Anika",
          "role": "Manager"
        },
        {
          "name": "Kamal",
          "role": "Employee"
        }
      ],
      "conversation": "Anika: Hi Kamal, thanks for coming in. Please, have a seat.\nKamal: Hi Anika. No problem. So, it's that time of year again.\nAnika: It is. As you know, this is your semi-annual performance review. I want to go over your progress from the last six months and set some goals for the next six. How have you been feeling about your role recently?\nKamal: I feel good about it. I think the social media campaigns I led in the last quarter were really successful, and I've enjoyed taking on more responsibility with the new interns.\nAnika: I agree. Your work on the Q2 campaigns was outstanding. You boosted engagement by over 20%, which was beyond our targets. We really value your creativity and your leadership on those projects. You've been a great mentor to the new team members.\nKamal: Thank you, Anika. I really appreciate that.\nAnika: Of course. Now, I also want to touch upon an area where I think there's room for improvement. I've noticed in our team meetings that you sometimes hesitate to share your opinions, especially if they differ from the general consensus.\nKamal: Oh. I guess… I guess I just try to avoid being disagreeable. I want to be a team player, and I don't want to slow things down by arguing a point if everyone else is already on board.\nAnika: I understand that impulse, but your perspective is valuable, Kamal. We hired you because of your unique expertise. When you hold back, the team misses out on potentially great ideas or important counterarguments that could save us from making a mistake. Healthy debate is what helps us come up with the best solutions. We don't want to be a team that just nods and agrees with the first idea.\nKamal: I see your point. I suppose I've been worried about coming across as difficult or not supportive of the team's direction.\nAnika: I can assure you, offering a different viewpoint isn't being difficult—it's being diligent. I want you to feel more empowered to speak up. How about we set a goal for you for the next quarter? In every major project meeting, I want you to make it a point to contribute at least one critical thought or alternative suggestion.\nKamal: That's a specific goal. I think I can do that. It gives me a clear target. It feels a bit like a challenge, but a good one.\nAnika: Exactly. This isn't about criticism; it's about your professional growth. I believe your insights could be a game-changer for our projects. I want to see you take more ownership of your voice in the room.\nKamal: Okay. Thank you for the feedback, Anika. It's direct, and I appreciate that. I'll make a conscious effort to step up in meetings.\nAnika: That's all I ask. I have no doubt you'll do great. Now, let's talk about that promotion you're aiming for…"
    },
    {
      "id": 5,
      "title": "Choosing a University Major",
      "category": "College and Student Life",
      "audio": "topic_5",
      "characters": [
        {
          "name": "Fatima",
          "role": "Second-year student"
        },
        {
          "name": "Ali",
          "role": "First-year student"
        }
      ],
      "conversation": "Ali: Hey Fatima, do you have a second? I saw you were in the student lounge.\nFatima: Hey Ali! Sure, what's on your mind? You look like you're wrestling with a big decision.\nAli: You have no idea. I have to declare my major by the end of this semester, and I'm completely torn. I just can't make up my mind.\nFatima: Ah, the classic dilemma. I remember it well. What are you trying to choose between?\nAli: It's down to two options: Computer Science and Economics. On one hand, Computer Science seems like the practical choice. There are so many jobs, the pay is great, and I'm pretty good at coding. It feels like the safe bet for the future.\nFatima: That makes sense. Job security is a huge factor. So what's the issue with that?\nAli: The thing is, I don't know if I love it. I find it interesting, but I can't see myself getting excited about coding all day, every day. But then there's Economics. I find it fascinating. My intro to macroeconomics class was the best class I took last semester. I love understanding how systems work, the global markets, public policy…\nFatima: But you're worried about the career prospects?\nAli: Exactly! What do you even do with an Economics degree? It feels so much broader and less certain than Computer Science. My parents are pushing me towards CS because they see it as a direct path to a stable career.\nFatima: I get that. My parents were the same when I chose to major in English Literature. They were like, \"What job will you get with that?\" But you know what I've learned? You can be successful in almost any field if you're passionate about it. When you enjoy what you're studying, you work harder, you get better grades, and you actively seek out opportunities.\nAli: So you think I should follow my passion?\nFatima: I think you should do some research. Go talk to the career services office. They have data on what alumni from both majors are doing now. You might be surprised. An Economics degree can lead to jobs in finance, consulting, government, data analysis… it's incredibly versatile. Maybe you could even find a way to combine your interests.\nAli: Combine them? How?\nFatima: Think about fintech—financial technology. It's a huge and growing field that blends computer science and economics perfectly. Or what about data science for economic modeling? Don't think of them as two separate boxes. Maybe you could major in one and minor in the other.\nAli: A major and a minor… I hadn't actually considered that. That might be the perfect compromise. I could get the technical skills from CS and still study the subject I'm passionate about. Wow. Thanks, Fatima. You've given me a lot to think about.\nFatima: No problem, Ali. It's a big decision, so take your time and explore all the angles. Don't just pick what seems safe—pick what excites you."
    },
    {
      "id": 6,
      "title": "The Struggles of a Group Project",
      "category": "College and Student Life",
      "audio": "topic_6",
      "characters": [
        {
          "name": "Aisha",
          "role": "Student"
        },
        {
          "name": "Ben",
          "role": "Student"
        }
      ],
      "conversation": "Aisha: Ben, I am so glad I ran into you. We need to talk about the history group project. The presentation is next Friday, and I'm starting to panic.\nBen: Hey, Aisha. Yeah, I've been thinking about it too. What's going on? I thought we divided up the work pretty clearly last week.\nAisha: We did, but that's the problem. I finished my section on the social impact of the Industrial Revolution two days ago. I've emailed my slides to you, Mark, and Chloe. The only person I've heard back from is you.\nBen: I saw your slides, they looked great. I finished my section on technological innovations last night. But you're right, I haven't seen anything from Mark or Chloe. Their parts on the political and economic effects are pretty crucial. We can't exactly put the presentation together without them.\nAisha: I know! I sent them a follow-up email this morning and a message in our group chat, but I've gotten radio silence. I feel like we're the only two pulling our weight here. It's really frustrating.\nBen: I agree. Mark is always hard to get a hold of, but Chloe is usually on top of things. Maybe something came up?\nAisha: Maybe, but she could at least send a quick message to let us know. At this rate, we're going to be scrambling to finish everything at the last minute. This project is worth 30% of our final grade. We can't afford to mess it up.\nBen: You're absolutely right. Okay, let's make a plan. How about we try to talk to them in person? I have a class with Mark this afternoon. I'll catch him after the lecture and see what's going on.\nAisha: That's a good idea. I can try to find Chloe at the library. She's usually there in the evenings. Maybe if we talk to them face-to-face, it will be more effective than just sending messages.\nBen: Exactly. We need to be firm but fair. Let's find out if they need help, but also make it clear that the deadline is not flexible and we all need to contribute equally. If they still don't cooperate after we talk to them, we might have to bring Professor Davies into the loop.\nAisha: I really hope it doesn't come to that. I hate the idea of being a tattletale, but this is our grade on the line.\nBen: I know, it's a worst-case scenario. But we have to protect our own work. Let's try our plan first. I'll text you after I talk to Mark.\nAisha: Okay, sounds good. Thanks, Ben. I feel a bit better now that we have a plan of action. I just hate the stress of group projects sometimes.\nBen: Tell me about it. It's always a roll of the dice. Let's go get this sorted out."
    }
  ];

module.exports = listeningTopics;