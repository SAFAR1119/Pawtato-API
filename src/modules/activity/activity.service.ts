import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { Activity, ActivityDocument } from './schemas/activity.schema';
import { ActivityQueryDto } from './dto/activity-query.dto';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<ActivityDocument>,
  ) {}

  // `actor` is explicitly cast to ObjectId — found while auditing the same
  // bug class Phase 16 fixed in MedicalService/VaccinationsService: storing
  // it as a raw string (the pre-existing behavior) left `findAll()`'s
  // `.populate('actor', 'fullName email')` unable to resolve the actor's
  // info against the User collection, since populate matches on real
  // ObjectId equality. `target` is deliberately left as a plain string —
  // it's a generic label (petId/tagId/reportId/...), not a single-collection
  // ref, so there's no populate/cast concern for it.
  async log(
    actor: string,
    action: string,
    target: string,
    metadata: Record<string, any> = {},
  ) {
    return this.activityModel.create({
      actor: new Types.ObjectId(actor),
      action,
      target,
      metadata,
    });
  }

  async findAll(query: ActivityQueryDto) {
    const { page, limit, actor, action } = query;

    const filter: Record<string, unknown> = {};

    if (actor) {
      filter.actor = new Types.ObjectId(actor);
    }

    if (action) {
      filter.action = action;
    }

    const total = await this.activityModel.countDocuments(filter);

    const activities = await this.activityModel
      .find(filter)
      .populate('actor', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      activities,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
