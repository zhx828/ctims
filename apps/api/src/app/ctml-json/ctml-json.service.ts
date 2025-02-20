import { Injectable } from '@nestjs/common';
import { CreateCtmlJsonDto } from './dto/create-ctml-json.dto';
import { UpdateCtmlJsonDto } from './dto/update-ctml-json.dto';
import { ctml_json, event_type, user } from "@prisma/client";
import {PrismaService} from "../prisma.service";
import axios from "axios";
import {TrialStatusEnum} from "../../../../../libs/types/src/trial-status.enum";

@Injectable()
export class CtmlJsonService {

  constructor(
    private readonly prismaService: PrismaService
  ) { }
  async create(createCtmlJsonDto: CreateCtmlJsonDto) {
    const { data, version, trialId } = createCtmlJsonDto;
    const createdCtmlJson = await this.prismaService.ctml_json.create({
      data: {
        data,
        version: { connect: { version } },
        trial: { connect: { id: trialId } }
      }
    });
    return createdCtmlJson;
  }

  async findAll(): Promise<ctml_json[]> {
    let ctmlJsons = await this.prismaService.ctml_json.findMany();
    ctmlJsons = ctmlJsons.map(ctmlJson => {
      ctmlJson.data = JSON.parse(ctmlJson.data as string);
      return ctmlJson;
    })
    return ctmlJsons;
  }

  async findOne(id: number) {
    const ctmlJson = await this.prismaService.ctml_json.findUnique({
      where: { id: id }
    });
    ctmlJson.data = JSON.parse(ctmlJson.data as string);
    return ctmlJson;
  }

  async findByTrialId(trialId: number): Promise<ctml_json[]> {
    let ctmlJsons = await this.prismaService.ctml_json.findMany({
      where: {
        trialId: trialId
      }
    });
    ctmlJsons = ctmlJsons.map(ctmlJson => {
      ctmlJson.data = JSON.parse(ctmlJson.data as string);
      return ctmlJson;
    })
    return ctmlJsons;
  }

  async update(updateCtmlJsonDto: UpdateCtmlJsonDto): Promise<ctml_json[]> {
    const { data, version, trialId } = updateCtmlJsonDto;

    const ctml_schema_version = await this.prismaService.ctml_schema.findUnique({
      where: {
        version
      }
    })

    const existingJsons = await this.prismaService.ctml_json.findMany({
      where: {
        AND: [
          { trialId: trialId },
          { versionId: ctml_schema_version.id }
        ]
      }
    })

    if (existingJsons.length > 0) {
      const r = await this.prismaService.ctml_json.updateMany({
        data: {
          data,
        },
        where: {
          AND: [
            { trialId: trialId },
            { versionId: ctml_schema_version.id }
          ]
        }
      });
      let affected = await this.prismaService.ctml_json.findMany({
        where: {
          AND: [
            { trialId: trialId },
            { versionId: ctml_schema_version.id }
          ]
        }
      });

      // Convert the string version of the data into an object
      affected = affected.map(val => {
        val.data = JSON.parse(val.data as string);
        return val;
      })
      return affected;

    }

    const newCtmlJson = await this.prismaService.ctml_json.create({
      data: {
        data,
        versionId: ctml_schema_version.id,
        trialId: trialId
      }
    });
    return [newCtmlJson];
  }

  remove(id: number) {
    return this.prismaService.ctml_json.delete({ where: { id } });
  }

  async send_to_matchminer(trialId: number, ctml_json: any) {
    try {
      const url = `${process.env.MM_API_URL}/load_trial`;
      const results = await axios.request(
        {
          method: 'post',
          url: url,
          data: ctml_json,
        }
      );
      console.log(results);

      // update the trial's status to pending
      const trial = await this.prismaService.trial.findUnique({
        where: {
          id: trialId
        }
      });
      if (trial) {
        // in case if the trial wasn't saved before sending to matchminer
        await this.prismaService.trial.update({
          where: {
            id: trialId
          },
          data: {
            trial_status: TrialStatusEnum.PENDING
          }
        });
      }
    } catch (error) {
      console.log(error);
      throw new Error(error);
    }
  }

  async run_match() {
    try {
      const url = `${process.env.MM_API_URL}/run_ctims_matchengine`;
      const results = await axios.request(
        {
          method: 'get',
          url: url,
        }
      );
      console.log(results);

      // update the trial's status from pending to matched
      const trial = await this.prismaService.trial.updateMany({
        where: {
          trial_status: TrialStatusEnum.PENDING
        },
        data: {
          trial_status: TrialStatusEnum.MATCHED
        }
      });
    } catch (error) {
      console.log(error);
      throw new Error(error);
    }
  }
}
