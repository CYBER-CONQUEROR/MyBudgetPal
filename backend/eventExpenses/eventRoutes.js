import express from "express";
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  fundEvent,
  defundEvent,     // <-- NEW
  spendEvent,
} from "./eventController.js";

const router = express.Router();

router.get("/", listEvents);
router.post("/", createEvent);
router.put("/:id", updateEvent);
router.delete("/:id", deleteEvent);
router.post("/:id/fund", fundEvent);
router.post("/:id/defund", defundEvent);  // <-- NEW
router.post("/:id/spend", spendEvent);

export default router;
